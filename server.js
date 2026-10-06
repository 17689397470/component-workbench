/**
 * 后端服务入口 (server.js)
 * 启动 Express Web 服务，自动侦测局域网 IP并在终端输出二维码，
 * 提供 RESTful API、BOM 解析比对、立创官方物料检索与 SQLite 存储。
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const os = require('os');
const multer = require('multer');
const qrcodeTerminal = require('qrcode-terminal');
const XLSX = require('xlsx');
const QRCode = require('qrcode');

const fs = require('fs');
const db = require('./lib/db');
const { parseComponentText, parseFreeformBatchText } = require('./lib/parser');
const { queryOfficialComponent } = require('./lib/lcscService');
const { parseBOMFile, compareBOMWithStock, generatePickingList, extractPurchaseShortageList } = require('./lib/bomMatcher');
const { parseTaobaoOrderFile } = require('./lib/taobaoParser');
const taobaoRules = require('./lib/taobaoRules');

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件配置
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use((req, res, next) => {
  console.log(`[HTTP] ${req.method} ${req.url}`);
  next();
});

app.use(express.static(path.join(__dirname, 'public'), {
  etag: false,
  maxAge: 0,
  setHeaders: (res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  }
}));

// 文件上传内存存储
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

/**
 * 获取本机所有局域网 IPv4 地址
 */
function getLocalIPAddresses() {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        addresses.push(iface.address);
      }
    }
  }
  return addresses;
}

// ==================== API 路由 ====================

// 1. 获取服务器与网络信息
app.get('/api/info', (req, res) => {
  const ips = getLocalIPAddresses();
  const primaryIp = ips[0] || '127.0.0.1';
  res.json({
    status: 'ok',
    port: PORT,
    primaryIp,
    allIps: ips,
    mobileUrl: `http://${primaryIp}:${PORT}`
  });
});

// 2. 元器件搜索与列表
app.get('/api/components', async (req, res) => {
  try {
    const { query, category, location, low_stock } = req.query;
    const list = await db.searchComponents({
      query,
      category,
      location,
      lowStockOnly: low_stock === 'true'
    });
    res.json({ success: true, count: list.length, data: list });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. 获取常用位置列表（胶囊选择器）
app.get('/api/components/frequent-locations', async (req, res) => {
  try {
    const locations = await db.getFrequentLocations(12);
    res.json({ success: true, data: locations });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4. 获取分类汇总数据
app.get('/api/components/categories', async (req, res) => {
  try {
    const stats = await db.getCategoryStats();
    res.json({ success: true, data: stats });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 5. 快速智能官方解析与识别 (立创在线查询 + 本地规则)
app.post('/api/components/query-official', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ success: false, error: '缺少待查询文本' });
    const result = await queryOfficialComponent(text);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 5.1 批量随手记与自由文本智能拆解并查重
app.post('/api/components/parse-batch', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ success: false, error: '缺少待拆解文本' });
    }
    const result = parseFreeformBatchText(text);
    const allStock = await db.searchComponents({});

    // 为每个拆解出来的物料比对库存查重
    const enrichedItems = result.items.map(item => {
      const match = allStock.find(c => {
        if (item.lcsc_part && c.lcsc_part && item.lcsc_part.trim().toUpperCase() === c.lcsc_part.trim().toUpperCase()) return true;
        if (item.name && c.name && item.name.trim().toLowerCase() === c.name.trim().toLowerCase()) {
          if (item.package && c.package) {
            return item.package.trim().toLowerCase() === c.package.trim().toLowerCase();
          }
          return true;
        }
        return false;
      });

      return {
        ...item,
        duplicate: match ? {
          exists: true,
          id: match.id,
          name: match.name,
          current_quantity: match.quantity,
          location: match.location || '随手存放处'
        } : { exists: false }
      };
    });

    res.json({ success: true, count: enrichedItems.length, items: enrichedItems });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 5.2 批量卡片队列一次性存入与合并
app.post('/api/components/batch-add', async (req, res) => {
  try {
    const { items } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, error: '待入库项列表为空' });
    }

    const createdList = [];
    const mergedList = [];

    for (const item of items) {
      const addQty = parseInt(item.quantity, 10) || 1;
      if (item.duplicateTargetId && !item.isForceNew) {
        // 合并补仓
        const updated = await db.adjustQuantity(item.duplicateTargetId, addQty);
        mergedList.push({
          componentId: item.duplicateTargetId,
          name: item.name,
          quantity: addQty,
          location: item.location,
          isAdd: true,
          updatedStock: updated ? updated.quantity : null
        });
      } else {
        // 新建元器件
        const newComp = await db.createComponent({
          name: item.name,
          category: item.category || '其他',
          package: item.package || '',
          value: item.value || '',
          standard_value: item.standard_value || null,
          unit: item.unit || '',
          voltage: item.voltage || null,
          tolerance: item.tolerance || '',
          quantity: addQty,
          lcsc_part: item.lcsc_part || '',
          location: item.location || '随手存放处',
          notes: item.notes || '',
          image_url: item.image_url || '',
          datasheet_url: item.datasheet_url || ''
        });
        createdList.push({
          componentId: newComp.id,
          name: newComp.name,
          quantity: addQty,
          location: newComp.location,
          isAdd: false
        });
      }
    }

    res.json({
      success: true,
      data: {
        total: createdList.length + mergedList.length,
        created: createdList,
        merged: mergedList
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 6. 新增元器件
app.post('/api/components', async (req, res) => {
  try {
    const comp = await db.createComponent(req.body);
    res.json({ success: true, data: comp });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 6.5 获取单个元器件详情
app.get('/api/components/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const comp = await db.getComponentById(id);
    if (!comp) return res.status(404).json({ success: false, error: '未找到元器件' });
    res.json({ success: true, data: comp });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 7. 更新元器件
app.put('/api/components/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const result = await db.updateComponent(id, req.body);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 8. 快速增减库存 (就地步进)
app.post('/api/components/:id/adjust', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const delta = parseInt(req.body.delta, 10) || 0;
    const updated = await db.adjustQuantity(id, delta);
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 9. 删除元器件
app.delete('/api/components/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const result = await db.deleteComponent(id);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 10. 冷启动预置常用阻容与芯片
app.post('/api/components/seed-presets', async (req, res) => {
  try {
    const result = await db.seedCommonPresets();
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 11. 收纳空间与盒贴二维码
app.get('/api/boxes', async (req, res) => {
  try {
    const boxes = await db.getBoxesSummary();
    const ips = getLocalIPAddresses();
    const primaryIp = ips[0] || '127.0.0.1';
    const baseUrl = `http://${primaryIp}:${PORT}`;

    const enrichedBoxes = await Promise.all(boxes.map(async (box) => {
      const boxParam = encodeURIComponent(box.box_name);
      const mobileUrl = `${baseUrl}/#box=${boxParam}`;
      let qrDataUrl = '';
      try {
        qrDataUrl = await QRCode.toDataURL(mobileUrl, {
          margin: 1,
          width: 220,
          color: { dark: '#111111', light: '#ffffff' }
        });
      } catch (e) {
        console.error('QR code generation error:', e);
      }

      return {
        ...box,
        categories_list: box.categories ? box.categories.split(',') : [],
        packages_list: box.packages ? box.packages.split(',') : [],
        item_names_list: box.item_names ? box.item_names.split(',') : [],
        mobile_url: mobileUrl,
        qr_data_url: qrDataUrl
      };
    }));

    res.json({ success: true, count: enrichedBoxes.length, data: enrichedBoxes });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 12. 获取指定收纳盒内全部物料清单 (透视箱)
app.get('/api/boxes/items', async (req, res) => {
  try {
    const boxName = req.query.name || '';
    const items = await db.getBoxItems(boxName);
    res.json({ success: true, box_name: boxName, count: items.length, data: items });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 13. 获取低库存与告警清单
app.get('/api/components/low-stock', async (req, res) => {
  try {
    const list = await db.getLowStockList();
    res.json({ success: true, count: list.length, data: list });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 14. 查询出入库流水日志
app.get('/api/logs', async (req, res) => {
  try {
    const { component_id, limit } = req.query;
    const logs = await db.getStockLogs({
      componentId: component_id ? parseInt(component_id, 10) : null,
      limit: limit ? parseInt(limit, 10) : 50
    });
    res.json({ success: true, count: logs.length, data: logs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 15. 导出待补货采购清单 (Excel)
app.get('/api/components/export-replenishment', async (req, res) => {
  try {
    const list = await db.getLowStockList();
    const rows = list.map(item => ({
      '型号/品名': item.name,
      '分类': item.category,
      '封装': item.package || '',
      '存放位置': item.location || '',
      '当前库存': item.quantity,
      '安全库存': item.effective_min_stock,
      '建议补货数': Math.max(item.shortage_qty, item.effective_min_stock * 2),
      '立创编号': item.lcsc_part || '',
      '立创搜索': item.lcsc_part ? `https://item.szlcsc.com/${item.lcsc_part.replace(/[^0-9]/g, '')}.html` : `https://so.szlcsc.com/global.html?k=${encodeURIComponent(item.name)}`,
      '备注': item.notes || ''
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '待补货清单');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Disposition', 'attachment; filename="replenishment_list.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buf);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 11. 导出全部数据为 Excel 或 JSON
app.get('/api/components/export', async (req, res) => {
  try {
    const format = req.query.format || 'excel';
    const list = await db.exportAll();

    if (format === 'json') {
      res.setHeader('Content-Disposition', 'attachment; filename="components_backup.json"');
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.send(JSON.stringify(list, null, 2));
    }

    // 默认 Excel 导出
    const ws = XLSX.utils.json_to_sheet(list);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '库存清单');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Disposition', 'attachment; filename="components_export.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buf);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 12. 上传并解析 BOM 文件
app.post('/api/bom/upload', upload.single('bomFile'), (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ success: false, error: '未接收到 BOM 文件' });
    }
    const parsed = parseBOMFile(req.file.buffer);
    res.json({
      success: true,
      filename: req.file.originalname,
      data: parsed
    });
  } catch (err) {
    res.status(500).json({ success: false, error: `BOM 解析失败: ${err.message}` });
  }
});

// 13. 执行 BOM 与库存比对
app.post('/api/bom/compare', async (req, res) => {
  try {
    const { rows, mapping } = req.body;
    if (!rows || !mapping) {
      return res.status(400).json({ success: false, error: '缺少 BOM 数据或列映射参数' });
    }

    const stockList = await db.exportAll();
    const comparison = compareBOMWithStock(rows, mapping, stockList);
    const pickingList = generatePickingList(comparison.results);
    const shortageList = extractPurchaseShortageList(comparison.results);

    res.json({
      success: true,
      summary: comparison.summary,
      results: comparison.results,
      pickingList,
      shortageList
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 14. BOM 一键出库扣减
app.post('/api/bom/deduct', async (req, res) => {
  try {
    const { items } = req.body; // Array of { id, deductQty }
    if (!items || !Array.isArray(items)) {
      return res.status(400).json({ success: false, error: '缺少出库扣减物料清单' });
    }
    const result = await db.batchDeduct(items);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 16. 淘宝/电商元器件订单解析预览 (含智能黑名单过滤与重复订单防重检测)
app.post('/api/taobao/preview', upload.single('orderFile'), async (req, res) => {
  try {
    let buffer = null;
    let filename = '';

    if (req.file) {
      buffer = req.file.buffer;
      filename = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
    } else {
      const defaultPaths = [
        path.join(__dirname, '订单数据.xlsx'),
        path.join(__dirname, '..', 'power', '订单数据.xlsx'),
        path.join(__dirname, '淘宝订单.xlsx'),
        path.join(__dirname, '订单.xlsx')
      ];
      for (const p of defaultPaths) {
        if (fs.existsSync(p)) {
          buffer = fs.readFileSync(p);
          filename = path.basename(p);
          break;
        }
      }
    }

    if (!buffer) {
      return res.status(400).json({ success: false, error: '未接收到订单文件，且当前目录下无默认【订单数据.xlsx】文件' });
    }

    const rules = taobaoRules.getRules();
    const items = parseTaobaoOrderFile(buffer, rules);
    const database = db.getDb();
    const activeOrderMap = await db.getActiveImportedOrderMap();

    const enriched = await Promise.all(items.map(async (item) => {
      let found = null;
      if (item.category === '电阻' && item.standard_value !== null && item.package) {
        found = await new Promise((resolve) => {
          database.get(
            `SELECT * FROM components WHERE category = '电阻' AND package = ? AND standard_value = ? LIMIT 1`,
            [item.package, item.standard_value],
            (err, row) => resolve(row || null)
          );
        });
      } else if (item.category === '电容' && item.standard_value !== null && item.package) {
        found = await new Promise((resolve) => {
          const sql = item.voltage
            ? `SELECT * FROM components WHERE category = '电容' AND package = ? AND standard_value = ? AND (voltage = ? OR voltage IS NULL) LIMIT 1`
            : `SELECT * FROM components WHERE category = '电容' AND package = ? AND standard_value = ? LIMIT 1`;
          const args = item.voltage ? [item.package, item.standard_value, item.voltage] : [item.package, item.standard_value];
          database.get(sql, args, (err, row) => resolve(row || null));
        });
      } else {
        found = await new Promise((resolve) => {
          database.get(
            `SELECT * FROM components WHERE name = ? OR (value != '' AND value = ? AND package = ?) LIMIT 1`,
            [item.name, item.value || item.name, item.package || ''],
            (err, row) => resolve(row || null)
          );
        });
      }

      // 订单防重识别
      const orderRecord = item.order_id && activeOrderMap[item.order_id];
      const isAlreadyImported = !!orderRecord;

      return {
        ...item,
        will_merge: !!found,
        existing_id: found ? found.id : null,
        existing_name: found ? found.name : null,
        existing_qty: found ? found.quantity : 0,
        existing_location: found ? found.location : null,
        already_imported: isAlreadyImported,
        imported_batch_id: orderRecord ? orderRecord.batch_id : null,
        imported_at: orderRecord ? orderRecord.created_at : null
      };
    }));

    res.json({
      success: true,
      filename,
      count: enriched.length,
      data: enriched,
      rules
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 17. 确认批量入库淘宝订单 (支持记录批次快照、订单关联与服务端严格防重拦截)
app.post('/api/taobao/confirm', async (req, res) => {
  try {
    const { items, defaultLocation = '淘宝待整理散料盒', filename = '淘宝订单导入.xlsx' } = req.body;
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, error: '没有需要入库的物料' });
    }

    // 服务端严格防重校验：查询当前生效中的订单号
    const activeOrderMap = await db.getActiveImportedOrderMap();
    const validItems = [];
    const blockedDuplicates = [];

    for (const item of items) {
      const isDup = item.order_id && activeOrderMap[item.order_id];
      if (isDup && !item._allowForceReimport && !item.allowForceReimport) {
        blockedDuplicates.push(item);
      } else {
        validItems.push(item);
      }
    }

    if (validItems.length === 0 && blockedDuplicates.length > 0) {
      return res.status(400).json({
        success: false,
        error: `【严格防重拦截】检测到提交的 ${blockedDuplicates.length} 项物料此前已全部入库（订单号: ${blockedDuplicates[0].order_id.slice(-8)} 等），系统已严格拦截，禁止重复入库！如确需补录请点击行右侧【解锁】。`
      });
    }

    const summary = await db.batchImportTaobaoComponents(validItems, defaultLocation, filename);
    summary.skippedDuplicateCount = blockedDuplicates.length;
    res.json({ success: true, summary });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 18. 淘宝导入批次历史记录
app.get('/api/taobao/batches', async (req, res) => {
  try {
    const batches = await db.getImportBatches(30);
    res.json({ success: true, data: batches });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 19. 一键撤销回滚指定导入批次
app.post('/api/taobao/batches/:batchId/rollback', async (req, res) => {
  try {
    const { batchId } = req.params;
    if (!batchId) {
      return res.status(400).json({ success: false, error: '缺少批次编号' });
    }
    const result = await db.rollbackImportBatch(batchId);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 20. 查询自定义解析规则与黑白名单
app.get('/api/taobao/rules', (req, res) => {
  try {
    res.json({ success: true, data: taobaoRules.getRules() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 21. 保存自定义解析规则与黑白名单
app.post('/api/taobao/rules', (req, res) => {
  try {
    const saved = taobaoRules.saveRules(req.body);
    res.json({ success: true, data: saved });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 22. 重置解析规则为默认配置
app.post('/api/taobao/rules/reset', (req, res) => {
  try {
    const reset = taobaoRules.resetRules();
    res.json({ success: true, data: reset });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==================== 制作项目与套料包管理 (Projects & Kits) ====================

// 23. 获取项目列表
app.get('/api/projects', async (req, res) => {
  try {
    const { status } = req.query;
    const list = await db.getProjectsList(status);
    res.json({ success: true, count: list.length, data: list });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 24. 创建新项目 (支持手动建或从 BOM 结果转存)
app.post('/api/projects', async (req, res) => {
  try {
    const { project = {}, items = [], auto_lock = true } = req.body;
    if (!project.name || !project.name.trim()) {
      return res.status(400).json({ success: false, error: '项目名称不能为空' });
    }
    const created = await db.createProject(project, items, auto_lock);
    res.json({ success: true, data: created });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 25. 获取单个项目详情与套料明细
app.get('/api/projects/:id', async (req, res) => {
  try {
    const project = await db.getProjectDetail(req.params.id);
    if (!project) {
      return res.status(404).json({ success: false, error: '未找到该项目' });
    }
    res.json({ success: true, data: project });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 26. 更新项目信息
app.put('/api/projects/:id', async (req, res) => {
  try {
    const updated = await db.updateProject(req.params.id, req.body);
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 27. 智能预锁项目库存
app.post('/api/projects/:id/lock', async (req, res) => {
  try {
    const updated = await db.lockProjectStock(req.params.id);
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 28. 一键释放项目预锁库存
app.post('/api/projects/:id/unlock', async (req, res) => {
  try {
    const updated = await db.unlockProjectStock(req.params.id);
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 29. 完工正式投产消库
app.post('/api/projects/:id/complete', async (req, res) => {
  try {
    const finished = await db.completeProject(req.params.id);
    res.json({ success: true, data: finished });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 30. 删除项目
app.delete('/api/projects/:id', async (req, res) => {
  try {
    const result = await db.deleteProject(req.params.id);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 31. 提取项目专属缺料采购清单
app.get('/api/projects/:id/purchase', async (req, res) => {
  try {
    const result = await db.getProjectPurchaseList(req.params.id);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 32. 往项目添加元器件
app.post('/api/projects/:id/items', async (req, res) => {
  try {
    const detail = await db.addProjectItem(req.params.id, req.body);
    res.json({ success: true, data: detail });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 33. 从项目移除元器件
app.delete('/api/projects/:id/items/:itemId', async (req, res) => {
  try {
    const detail = await db.removeProjectItem(req.params.id, req.params.itemId);
    res.json({ success: true, data: detail });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 34. 更新项目元器件单板需求等
app.put('/api/projects/:id/items/:itemId', async (req, res) => {
  try {
    const detail = await db.updateProjectItem(req.params.id, req.params.itemId, req.body);
    res.json({ success: true, data: detail });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 35. 智能寻找工坊可用替代料
app.get('/api/projects/:id/items/:itemId/alternatives', async (req, res) => {
  try {
    const result = await db.findProjectItemAlternatives(req.params.id, req.params.itemId);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 36. 一键采用替代料
app.post('/api/projects/:id/items/:itemId/apply-alternative', async (req, res) => {
  try {
    const { component_id } = req.body;
    if (!component_id) {
      return res.status(400).json({ success: false, error: '缺少替代料ID' });
    }
    const detail = await db.applyProjectItemAlternative(req.params.id, req.params.itemId, component_id);
    res.json({ success: true, data: detail });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 37. 获取项目套料袋标签信息与直达二维码
app.get('/api/projects/:id/label', async (req, res) => {
  try {
    const project = await db.getProjectDetail(req.params.id);
    if (!project) {
      return res.status(404).json({ success: false, error: '项目不存在' });
    }
    const ips = getLocalIPAddresses();
    const primaryIp = ips[0] || '127.0.0.1';
    const mobileUrl = `http://${primaryIp}:${PORT}/#project=${project.id}`;

    let qrDataUrl = '';
    try {
      qrDataUrl = await QRCode.toDataURL(mobileUrl, {
        margin: 1,
        width: 220,
        color: { dark: '#111111', light: '#ffffff' }
      });
    } catch (e) {
      console.error('项目标签二维码生成失败:', e);
    }

    // 提炼关键核心芯片和元器件摘要（最多取前 4 项重点芯片/元器件）
    const keyItems = (project.items || [])
      .map(i => i.part_name)
      .slice(0, 4);

    res.json({
      success: true,
      data: {
        project_id: project.id,
        project_name: project.name,
        target_qty: project.target_qty,
        status: project.status,
        readiness_percent: project.readiness_percent,
        total_items_count: project.total_items_count,
        total_pieces_demand: project.total_pieces_demand,
        ready_items_count: project.ready_items_count,
        key_items: keyItems,
        qr_data_url: qrDataUrl,
        mobile_url: mobileUrl,
        pack_date: new Date().toISOString().slice(0, 10)
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 38. 全量数据备份下载（含所有表：库存/日志/批次/项目）
app.get('/api/backup/export', async (req, res) => {
  try {
    const backup = await db.exportFullBackup();
    const filename = `component-workbench-backup-${new Date().toISOString().slice(0, 10)}.json`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.send(JSON.stringify(backup, null, 2));
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 39. 全量数据恢复导入（覆盖式，清空后重建）
app.post('/api/backup/restore', upload.single('backupFile'), async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ success: false, error: '未接收到备份文件' });
    }
    let backup;
    try {
      backup = JSON.parse(req.file.buffer.toString('utf8'));
    } catch (e) {
      return res.status(400).json({ success: false, error: '备份文件 JSON 解析失败，请确认文件完整性' });
    }

    if (!backup.tables || typeof backup.tables !== 'object') {
      return res.status(400).json({ success: false, error: '备份文件格式不正确（缺少 tables 字段）' });
    }

    const stats = await db.importFullBackup(backup);
    res.json({
      success: true,
      message: '数据恢复成功！',
      exported_at: backup.exported_at || '未知',
      stats
    });
  } catch (err) {
    res.status(500).json({ success: false, error: `恢复失败: ${err.message}` });
  }
});

// 兜底单页路由
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ==================== 启动服务 ====================

async function startServer() {
  await db.initDb();

  app.listen(PORT, '0.0.0.0', () => {
    const localIPs = getLocalIPAddresses();
    const primaryIp = localIPs[0] || '127.0.0.1';
    const mobileUrl = `http://${primaryIp}:${PORT}`;
    const localUrl = `http://localhost:${PORT}`;

    console.log('\n========================================================');
    console.log('⚡ 个人元器件库存管理与 BOM 查重工作台 (BOM Pro) 已启动！');
    console.log(`💻 电脑访问地址:   ${localUrl}`);
    console.log(`📱 手机局域网地址: ${mobileUrl}`);
    console.log('--------------------------------------------------------');
    console.log('手机连接同一 Wi-Fi 后，扫描下方二维码即可直接在手机上使用:');
    qrcodeTerminal.generate(mobileUrl, { small: true });
    console.log('========================================================\n');
  });
}

startServer().catch(err => {
  console.error('[Fatal Error] 服务启动失败:', err);
  process.exit(1);
});
