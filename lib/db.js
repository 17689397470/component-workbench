/**
 * 数据库操作持久层 (lib/db.js)
 * 基于 SQLite 单文件数据库，支持自动建库建表、多字段模糊检索、
 * 常用位置统计、BOM原子出库扣减、E24阻容预设载入与数据导入导出。
 */

const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { parseComponentText, normalizePackage } = require('./parser');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'components.db');
let db = null;

function getDb() {
  if (!db) {
    db = new sqlite3.Database(DB_PATH);
  }
  return db;
}

/**
 * 初始化数据库表结构与索引
 */
function initDb() {
  return new Promise((resolve, reject) => {
    const database = getDb();
    database.serialize(() => {
      database.run(`
        CREATE TABLE IF NOT EXISTS components (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          category TEXT NOT NULL,
          package TEXT,
          value TEXT,
          standard_value REAL,
          unit TEXT,
          voltage REAL,
          tolerance TEXT,
          quantity INTEGER NOT NULL DEFAULT 0,
          location TEXT,
          lcsc_part TEXT,
          manufacturer TEXT,
          image_url TEXT,
          datasheet_url TEXT,
          tags TEXT,
          notes TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `, (err) => {
        if (err) return reject(err);
      });

      database.run(`CREATE INDEX IF NOT EXISTS idx_comp_name ON components(name)`);
      database.run(`CREATE INDEX IF NOT EXISTS idx_comp_cat ON components(category)`);
      database.run(`CREATE INDEX IF NOT EXISTS idx_comp_pkg ON components(package)`);
      database.run(`CREATE INDEX IF NOT EXISTS idx_comp_lcsc ON components(lcsc_part)`);
      database.run(`CREATE INDEX IF NOT EXISTS idx_comp_loc ON components(location)`);

      // 检查并添加 min_stock 字段 (若旧表不存在)
      database.run(`ALTER TABLE components ADD COLUMN min_stock INTEGER DEFAULT NULL`, () => {});

      // 创建出入库与操作流水表
      database.run(`
        CREATE TABLE IF NOT EXISTS stock_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          component_id INTEGER,
          component_name TEXT,
          change_qty INTEGER,
          balance_qty INTEGER,
          action_type TEXT,
          note TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `, () => {});
      database.run(`CREATE INDEX IF NOT EXISTS idx_log_comp ON stock_logs(component_id)`);
      database.run(`CREATE INDEX IF NOT EXISTS idx_log_time ON stock_logs(created_at)`);

      // 创建淘宝/BOM批量导入批次快照表 (支持防重复导入与一键撤销回滚)
      database.run(`
        CREATE TABLE IF NOT EXISTS import_batches (
          id TEXT PRIMARY KEY,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          filename TEXT,
          total_items INTEGER,
          total_pieces INTEGER,
          order_ids TEXT,
          status TEXT DEFAULT 'active',
          snapshot TEXT
        )
      `, () => {});
      database.run(`CREATE INDEX IF NOT EXISTS idx_batch_created ON import_batches(created_at)`);
      database.run(`CREATE INDEX IF NOT EXISTS idx_batch_status ON import_batches(status)`);

      // 创建制作项目与套料包管理表 (Projects & Kits)
      database.run(`
        CREATE TABLE IF NOT EXISTS projects (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          description TEXT DEFAULT '',
          target_qty INTEGER DEFAULT 1,
          status TEXT DEFAULT 'PREPARING',
          bom_filename TEXT DEFAULT '',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          completed_at DATETIME
        )
      `, () => {});
      database.run(`CREATE INDEX IF NOT EXISTS idx_project_status ON projects(status)`);
      database.run(`CREATE INDEX IF NOT EXISTS idx_project_created ON projects(created_at)`);

      database.run(`
        CREATE TABLE IF NOT EXISTS project_items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          project_id INTEGER NOT NULL,
          component_id INTEGER,
          part_name TEXT NOT NULL,
          package TEXT DEFAULT '',
          unit_demand_qty INTEGER DEFAULT 1,
          total_demand_qty INTEGER DEFAULT 1,
          locked_qty INTEGER DEFAULT 0,
          designators TEXT DEFAULT '',
          status TEXT DEFAULT 'SHORTAGE',
          FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
        )
      `, () => {});
      database.run(`CREATE INDEX IF NOT EXISTS idx_pitem_project ON project_items(project_id)`);
      database.run(`CREATE INDEX IF NOT EXISTS idx_pitem_comp ON project_items(component_id)`);

      // 检查库是否为空，若是则提示或允许冷启动
      database.get(`SELECT COUNT(*) as count FROM components`, (err, row) => {
        if (err) return reject(err);
        console.log(`[Database] SQLite 就绪 (${DB_PATH}), 当前库存元器件: ${row.count} 件`);
        resolve(row.count);
      });
    });
  });
}

/**
 * 记录出入库流水辅助函数
 */
function addStockLog(componentId, componentName, changeQty, balanceQty, actionType, note = '') {
  return new Promise((resolve) => {
    const database = getDb();
    database.run(`
      INSERT INTO stock_logs (component_id, component_name, change_qty, balance_qty, action_type, note)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [componentId, componentName, changeQty, balanceQty, actionType, note], function (err) {
      if (err) console.error('记录出入库流水失败:', err);
      resolve(this ? this.lastID : null);
    });
  });
}

/**
 * 模糊检索与列表查询
 * 支持多关键字以空格分隔 (如 "10k 0805", "桌底 340")
 * 自动计算并返回 effective_min_stock 和 is_low_stock 标记
 */
function searchComponents(params = {}) {
  return new Promise((resolve, reject) => {
    const database = getDb();
    const { query = '', category = '', location = '', lowStockOnly = false } = params;

    let sql = `
      SELECT c.*,
        COALESCE(c.min_stock, CASE WHEN c.category IN ('电阻', '电容', '电感') THEN 20 ELSE 3 END) AS effective_min_stock,
        (c.quantity <= COALESCE(c.min_stock, CASE WHEN c.category IN ('电阻', '电容', '电感') THEN 20 ELSE 3 END)) AS is_low_stock,
        COALESCE((
          SELECT SUM(pi.locked_qty) 
          FROM project_items pi 
          JOIN projects p ON pi.project_id = p.id 
          WHERE pi.component_id = c.id AND p.status IN ('PREPARING', 'READY', 'BUILDING')
        ), 0) AS locked_quantity,
        MAX(0, c.quantity - COALESCE((
          SELECT SUM(pi.locked_qty) 
          FROM project_items pi 
          JOIN projects p ON pi.project_id = p.id 
          WHERE pi.component_id = c.id AND p.status IN ('PREPARING', 'READY', 'BUILDING')
        ), 0)) AS available_quantity
      FROM components c
      WHERE 1=1
    `;
    const args = [];

    if (category) {
      sql += ` AND c.category = ?`;
      args.push(category);
    }

    if (location) {
      sql += ` AND c.location LIKE ?`;
      args.push(`%${location}%`);
    }

    if (lowStockOnly) {
      sql += ` AND c.quantity <= COALESCE(c.min_stock, CASE WHEN c.category IN ('电阻', '电容', '电感') THEN 20 ELSE 3 END)`;
    }

    if (query && query.trim()) {
      const keywords = query.trim().split(/\s+/).filter(Boolean);
      for (const kw of keywords) {
        sql += ` AND (
          c.name LIKE ? OR 
          c.category LIKE ? OR 
          c.package LIKE ? OR 
          c.value LIKE ? OR 
          c.location LIKE ? OR 
          c.lcsc_part LIKE ? OR 
          c.manufacturer LIKE ? OR 
          c.notes LIKE ? OR 
          c.tags LIKE ?
        )`;
        const pattern = `%${kw}%`;
        args.push(pattern, pattern, pattern, pattern, pattern, pattern, pattern, pattern, pattern);
      }
    }

    sql += ` ORDER BY c.updated_at DESC, c.id DESC`;

    database.all(sql, args, (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });
}

/**
 * 获取单个元件详情
 */
function getComponentById(id) {
  return new Promise((resolve, reject) => {
    const database = getDb();
    const sql = `
      SELECT c.*,
        COALESCE(c.min_stock, CASE WHEN c.category IN ('电阻', '电容', '电感') THEN 20 ELSE 3 END) AS effective_min_stock,
        (c.quantity <= COALESCE(c.min_stock, CASE WHEN c.category IN ('电阻', '电容', '电感') THEN 20 ELSE 3 END)) AS is_low_stock,
        COALESCE((
          SELECT SUM(pi.locked_qty) 
          FROM project_items pi 
          JOIN projects p ON pi.project_id = p.id 
          WHERE pi.component_id = c.id AND p.status IN ('PREPARING', 'READY', 'BUILDING')
        ), 0) AS locked_quantity,
        MAX(0, c.quantity - COALESCE((
          SELECT SUM(pi.locked_qty) 
          FROM project_items pi 
          JOIN projects p ON pi.project_id = p.id 
          WHERE pi.component_id = c.id AND p.status IN ('PREPARING', 'READY', 'BUILDING')
        ), 0)) AS available_quantity
      FROM components c
      WHERE c.id = ?
    `;
    database.get(sql, [id], (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

/**
 * 新增元件
 */
function createComponent(data) {
  return new Promise((resolve, reject) => {
    const database = getDb();
    const {
      name,
      category = '其他',
      package: pkg = '',
      value = '',
      standard_value = null,
      unit = '',
      voltage = null,
      tolerance = '',
      quantity = 0,
      min_stock = null,
      location = '',
      lcsc_part = '',
      manufacturer = '',
      image_url = '',
      datasheet_url = '',
      tags = '',
      notes = ''
    } = data;

    const sql = `
      INSERT INTO components (
        name, category, package, value, standard_value, unit, voltage, tolerance,
        quantity, min_stock, location, lcsc_part, manufacturer, image_url, datasheet_url, tags, notes,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `;

    database.run(
      sql,
      [name, category, pkg, value, standard_value, unit, voltage, tolerance, quantity, min_stock, location, lcsc_part, manufacturer, image_url, datasheet_url, tags, notes],
      function (err) {
        if (err) return reject(err);
        const newId = this.lastID;
        addStockLog(newId, name, quantity, quantity, 'ENTRY', notes || '新料录入初始入库');
        resolve({ id: newId, ...data });
      }
    );
  });
}

/**
 * 更新元件
 */
function updateComponent(id, data) {
  return new Promise((resolve, reject) => {
    const database = getDb();
    const fields = [];
    const args = [];

    const allowed = [
      'name', 'category', 'package', 'value', 'standard_value', 'unit',
      'voltage', 'tolerance', 'quantity', 'min_stock', 'location', 'lcsc_part',
      'manufacturer', 'image_url', 'datasheet_url', 'tags', 'notes'
    ];

    for (const key of allowed) {
      if (data[key] !== undefined) {
        fields.push(`${key} = ?`);
        args.push(data[key]);
      }
    }

    if (fields.length === 0) return resolve(null);

    fields.push(`updated_at = CURRENT_TIMESTAMP`);
    args.push(id);

    const sql = `UPDATE components SET ${fields.join(', ')} WHERE id = ?`;
    database.run(sql, args, function (err) {
      if (err) return reject(err);
      resolve({ id, updated: this.changes });
    });
  });
}

/**
 * 快速增减库存 (原子就地操作)
 */
function adjustQuantity(id, delta, note = '') {
  return new Promise((resolve, reject) => {
    const database = getDb();
    const sql = `
      UPDATE components 
      SET quantity = MAX(0, quantity + ?), updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `;
    database.run(sql, [delta, id], function (err) {
      if (err) return reject(err);
      database.get(`SELECT * FROM components WHERE id = ?`, [id], (err, row) => {
        if (err) return reject(err);
        if (row) {
          const actionType = delta > 0 ? 'RESTOCK' : 'STEPPER';
          const defaultNote = delta > 0 ? `就地增补 (+${delta})` : `就地消耗 (${delta})`;
          addStockLog(id, row.name, delta, row.quantity, actionType, note || defaultNote);
        }
        resolve(row);
      });
    });
  });
}

/**
 * 删除元件
 */
function deleteComponent(id) {
  return new Promise((resolve, reject) => {
    const database = getDb();
    database.run(`DELETE FROM components WHERE id = ?`, [id], function (err) {
      if (err) return reject(err);
      resolve({ id, deleted: this.changes });
    });
  });
}

/**
 * 获取使用频率最高的前若干个存放位置（用于手机端快速胶囊选择）
 */
function getFrequentLocations(limit = 10) {
  return new Promise((resolve, reject) => {
    const database = getDb();
    const sql = `
      SELECT location, COUNT(*) as count 
      FROM components 
      WHERE location IS NOT NULL AND TRIM(location) != '' 
      GROUP BY location 
      ORDER BY count DESC, MAX(updated_at) DESC 
      LIMIT ?
    `;
    database.all(sql, [limit], (err, rows) => {
      if (err) return reject(err);
      resolve(rows ? rows.map(r => r.location) : []);
    });
  });
}

/**
 * 获取分类统计
 */
function getCategoryStats() {
  return new Promise((resolve, reject) => {
    const database = getDb();
    const sql = `
      SELECT category, COUNT(*) as count, SUM(quantity) as total_qty 
      FROM components 
      GROUP BY category 
      ORDER BY count DESC
    `;
    database.all(sql, [], (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });
}

/**
 * 批量扣减库存 (BOM 一键出库闭环)
 * items: Array of { id, deductQty, name }
 */
function batchDeduct(items, projectName = 'BOM投产出库') {
  return new Promise((resolve, reject) => {
    if (!items || !items.length) return resolve({ deducted: 0 });
    const database = getDb();
    database.serialize(() => {
      database.run('BEGIN TRANSACTION');
      const stmt = database.prepare(`
        UPDATE components 
        SET quantity = MAX(0, quantity - ?), updated_at = CURRENT_TIMESTAMP 
        WHERE id = ?
      `);

      let errorOccurred = null;
      for (const it of items) {
        stmt.run([it.deductQty || 0, it.id], (err) => {
          if (err) errorOccurred = err;
        });
      }

      stmt.finalize();

      if (errorOccurred) {
        database.run('ROLLBACK', () => reject(errorOccurred));
      } else {
        database.run('COMMIT', (err) => {
          if (err) return reject(err);
          // 异步写入出库扣减流水日志
          for (const it of items) {
            database.get(`SELECT name, quantity FROM components WHERE id = ?`, [it.id], (e, r) => {
              if (r) {
                addStockLog(it.id, r.name, -(it.deductQty || 0), r.quantity, 'BOM_DEDUCT', projectName || 'BOM投产出库扣减');
              }
            });
          }
          resolve({ deducted: items.length });
        });
      }
    });
  });
}

/**
 * 查询出入库流水日志
 * 支持查询单个元件的时间轴，或查询全库最近变动记录
 */
function getStockLogs(params = {}) {
  return new Promise((resolve, reject) => {
    const database = getDb();
    const { componentId = null, limit = 50 } = params;
    let sql = `SELECT * FROM stock_logs`;
    const args = [];
    if (componentId) {
      sql += ` WHERE component_id = ?`;
      args.push(componentId);
    }
    sql += ` ORDER BY created_at DESC, id DESC LIMIT ?`;
    args.push(parseInt(limit, 10) || 50);

    database.all(sql, args, (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });
}

/**
 * 查询所有低库存/缺料元件（低于安全库存阈值）
 */
function getLowStockList() {
  return new Promise((resolve, reject) => {
    const database = getDb();
    const sql = `
      SELECT *,
        COALESCE(min_stock, CASE WHEN category IN ('电阻', '电容', '电感') THEN 20 ELSE 3 END) AS effective_min_stock,
        MAX(0, COALESCE(min_stock, CASE WHEN category IN ('电阻', '电容', '电感') THEN 20 ELSE 3 END) - quantity) AS shortage_qty,
        1 AS is_low_stock
      FROM components
      WHERE quantity <= COALESCE(min_stock, CASE WHEN category IN ('电阻', '电容', '电感') THEN 20 ELSE 3 END)
      ORDER BY (quantity = 0) DESC, shortage_qty DESC, category, name
    `;
    database.all(sql, [], (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });
}

/**
 * 导出全部数据为 JSON
 */
function exportAll() {
  return new Promise((resolve, reject) => {
    const database = getDb();
    database.all(`SELECT * FROM components ORDER BY id ASC`, [], (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });
}

/**
 * 载入常用基础阻容与芯片预设 (冷启动)
 */
function seedCommonPresets() {
  const commonPresets = [
    // 常用 0805 1% 贴片电阻
    { name: '0805 10kΩ ±1%', category: '电阻', package: '0805', value: '10kΩ', standard_value: 10000, unit: 'Ω', tolerance: '1%', quantity: 100, location: '默认电阻盒', notes: '常用上拉/分压' },
    { name: '0805 1kΩ ±1%', category: '电阻', package: '0805', value: '1kΩ', standard_value: 1000, unit: 'Ω', tolerance: '1%', quantity: 100, location: '默认电阻盒', notes: '常用LED限流' },
    { name: '0805 4.7kΩ ±1%', category: '电阻', package: '0805', value: '4.7kΩ', standard_value: 4700, unit: 'Ω', tolerance: '1%', quantity: 100, location: '默认电阻盒', notes: 'I2C上拉' },
    { name: '0805 100kΩ ±1%', category: '电阻', package: '0805', value: '100kΩ', standard_value: 100000, unit: 'Ω', tolerance: '1%', quantity: 100, location: '默认电阻盒', notes: '高阻分压/使能' },
    { name: '0805 0Ω 跳线电阻', category: '电阻', package: '0805', value: '0Ω', standard_value: 0, unit: 'Ω', tolerance: '5%', quantity: 50, location: '默认电阻盒', notes: '跳线/0欧短接' },
    { name: '0805 330Ω ±1%', category: '电阻', package: '0805', value: '330Ω', standard_value: 330, unit: 'Ω', tolerance: '1%', quantity: 50, location: '默认电阻盒', notes: 'LED限流' },

    // 常用 0603 / 0805 贴片电容
    { name: '0603 100nF (0.1µF) 50V X7R', category: '电容', package: '0603', value: '100nF', standard_value: 100000, unit: 'pF', voltage: 50, tolerance: '10%', quantity: 200, location: '默认电容盒', notes: '芯片电源去耦(最常用)' },
    { name: '0805 10µF 25V X5R', category: '电容', package: '0805', value: '10µF', standard_value: 10000000, unit: 'pF', voltage: 25, tolerance: '20%', quantity: 50, location: '默认电容盒', notes: '电源输入输出滤波' },
    { name: '0603 22pF 50V NPO', category: '电容', package: '0603', value: '22pF', standard_value: 22, unit: 'pF', voltage: 50, tolerance: '5%', quantity: 50, location: '默认电容盒', notes: '晶振起振匹配电容' },
    { name: '0805 1µF 50V X7R', category: '电容', package: '0805', value: '1µF', standard_value: 1000000, unit: 'pF', voltage: 50, tolerance: '10%', quantity: 50, location: '默认电容盒', notes: 'LDO滤波' },

    // 常用芯片与半导体
    { name: 'AMS1117-3.3 稳压IC', category: '芯片', package: 'SOT-223', value: 'AMS1117-3.3', voltage: 15, quantity: 20, location: '芯片收纳袋', lcsc_part: 'C6186', notes: '5V转3.3V常用LDO 1A' },
    { name: 'CH340C 串口芯片', category: '芯片', package: 'SOP-8', value: 'CH340C', quantity: 10, location: '芯片收纳袋', lcsc_part: 'C84681', notes: '内置晶振USB转串口' },
    { name: 'SS34 肖特基二极管', category: '二极管', package: 'SMA', value: 'SS34', voltage: 40, quantity: 30, location: '二极管袋', lcsc_part: 'C8678', notes: '3A 40V 防反接/续流' },
    { name: '1N4148W 开关二极管', category: '二极管', package: 'SOD-123', value: '1N4148W', voltage: 100, quantity: 50, location: '二极管袋', lcsc_part: 'C81598', notes: '高速小信号开关' },
    { name: 'AO3400 N沟道MOS管', category: '三极管/MOS', package: 'SOT-23', value: 'AO3400', voltage: 30, quantity: 30, location: '三极管袋', lcsc_part: 'C20917', notes: '30V 5.7A 常用驱动开关' },
    { name: 'TYPE-C 16P 四脚插板', category: '接插件', package: 'TYPE-C', value: 'TYPE-C-16P', quantity: 15, location: '接插件盒', lcsc_part: 'C2835408', notes: '沉板/直插常用充电通信接口' }
  ];

  return new Promise((resolve, reject) => {
    const database = getDb();
    database.serialize(() => {
      let count = 0;
      const stmt = database.prepare(`
        INSERT INTO components (
          name, category, package, value, standard_value, unit, voltage, tolerance,
          quantity, location, lcsc_part, notes, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `);

      for (const p of commonPresets) {
        stmt.run([
          p.name, p.category, p.package, p.value, p.standard_value || null, p.unit || '',
          p.voltage || null, p.tolerance || '', p.quantity || 0, p.location || '',
          p.lcsc_part || '', p.notes || ''
        ], () => {
          count++;
        });
      }

      stmt.finalize((err) => {
        if (err) return reject(err);
        resolve({ seeded: count });
      });
    });
  });
}

/**
 * 获取所有物理收纳盒摘要（用于收纳空间视图与标签打印）
 */
function getBoxesSummary() {
  return new Promise((resolve, reject) => {
    const database = getDb();
    database.all(`
      SELECT 
        COALESCE(NULLIF(TRIM(location), ''), '未指定收纳盒 (随手放)') AS box_name,
        COUNT(*) AS item_count,
        COALESCE(SUM(quantity), 0) AS total_quantity,
        GROUP_CONCAT(DISTINCT category) AS categories,
        GROUP_CONCAT(DISTINCT package) AS packages,
        MIN(name) AS sample_name,
        MIN(value) AS sample_value,
        GROUP_CONCAT(DISTINCT name) AS item_names
      FROM components
      GROUP BY box_name
      ORDER BY item_count DESC, total_quantity DESC
    `, [], (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });
}

/**
 * 获取指定收纳盒的所有物料清单（用于透视箱视图）
 */
function getBoxItems(boxName) {
  return new Promise((resolve, reject) => {
    const database = getDb();
    let sql, args;
    if (!boxName || boxName === '未指定收纳盒 (随手放)') {
      sql = `SELECT * FROM components WHERE location IS NULL OR TRIM(location) = '' OR location = '未指定收纳盒 (随手放)' ORDER BY category, name`;
      args = [];
    } else {
      sql = `SELECT * FROM components WHERE TRIM(location) = TRIM(?) ORDER BY category, name`;
      args = [boxName];
    }
    database.all(sql, args, (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });
}

/**
 * 查询所有活跃批次中已入库的订单号映射 (用于防重复导入预检)
 */
function getActiveImportedOrderMap() {
  return new Promise((resolve, reject) => {
    const database = getDb();
    database.all(
      `SELECT id, created_at, order_ids FROM import_batches WHERE status = 'active' ORDER BY created_at DESC`,
      (err, rows) => {
        if (err) return reject(err);
        const map = {};
        (rows || []).forEach(row => {
          try {
            const list = JSON.parse(row.order_ids || '[]');
            list.forEach(ord => {
              if (ord && !map[ord]) {
                map[ord] = {
                  batch_id: row.id,
                  created_at: row.created_at
                };
              }
            });
          } catch (e) {}
        });
        resolve(map);
      }
    );
  });
}

/**
 * 查询导入历史批次列表
 */
function getImportBatches(limit = 30) {
  return new Promise((resolve, reject) => {
    const database = getDb();
    database.all(
      `SELECT id, created_at, filename, total_items, total_pieces, order_ids, status FROM import_batches ORDER BY created_at DESC LIMIT ?`,
      [limit],
      (err, rows) => {
        if (err) return reject(err);
        const result = (rows || []).map(r => {
          let orderList = [];
          try { orderList = JSON.parse(r.order_ids || '[]'); } catch (e) {}
          return {
            ...r,
            order_ids: orderList
          };
        });
        resolve(result);
      }
    );
  });
}

/**
 * 撤销回滚指定导入批次 (整批原子退库并删除新建物料)
 */
async function rollbackImportBatch(batchId) {
  const database = getDb();
  const batch = await new Promise((resolve, reject) => {
    database.get(`SELECT * FROM import_batches WHERE id = ?`, [batchId], (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });

  if (!batch) {
    throw new Error(`未找到导入批次 [${batchId}]`);
  }
  if (batch.status === 'rolled_back') {
    throw new Error(`批次 [${batchId}] 此前已经撤销回滚，无需重复操作`);
  }

  let snapshot = [];
  try {
    snapshot = JSON.parse(batch.snapshot || '[]');
  } catch (e) {
    throw new Error(`批次快照损坏无法回滚: ${e.message}`);
  }

  let revertedCount = 0;
  let totalPiecesReverted = 0;

  for (const item of snapshot) {
    const qtyAdded = parseInt(item.qty_added, 10) || 0;
    totalPiecesReverted += qtyAdded;

    if (item.is_new) {
      // 新录入的物料：检查当前存量
      const comp = await new Promise((res) => {
        database.get(`SELECT * FROM components WHERE id = ?`, [item.component_id], (err, row) => res(row || null));
      });

      if (comp) {
        if (comp.quantity <= qtyAdded) {
          // 当前库存未超出本次入库数量，直接安全物理删除
          await new Promise((res, rej) => {
            database.run(`DELETE FROM components WHERE id = ?`, [item.component_id], (err) => err ? rej(err) : res());
          });
          addStockLog(item.component_id, item.name, -qtyAdded, 0, 'ROLLBACK', `批量导入撤销 (删除新建物料) [批次:${batchId}]`);
        } else {
          // 已经有其他入库，仅扣减该批次添加的数量
          const newQty = comp.quantity - qtyAdded;
          await new Promise((res, rej) => {
            database.run(`UPDATE components SET quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [newQty, item.component_id], (err) => err ? rej(err) : res());
          });
          addStockLog(item.component_id, item.name, -qtyAdded, newQty, 'ROLLBACK', `批量导入撤销扣减 [批次:${batchId}]`);
        }
        revertedCount++;
      }
    } else {
      // 累加同款物料：将增加的库存如数扣除
      const comp = await new Promise((res) => {
        database.get(`SELECT * FROM components WHERE id = ?`, [item.component_id], (err, row) => res(row || null));
      });

      if (comp) {
        const newQty = Math.max(0, (comp.quantity || 0) - qtyAdded);
        await new Promise((res, rej) => {
          database.run(`UPDATE components SET quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [newQty, item.component_id], (err) => err ? rej(err) : res());
        });
        addStockLog(item.component_id, item.name, -qtyAdded, newQty, 'ROLLBACK', `批量导入撤销回滚 [批次:${batchId}]`);
        revertedCount++;
      }
    }
  }

  // 更新批次状态为已撤销
  await new Promise((resolve, reject) => {
    database.run(`UPDATE import_batches SET status = 'rolled_back' WHERE id = ?`, [batchId], (err) => err ? reject(err) : resolve());
  });

  return {
    batchId,
    revertedCount,
    totalPiecesReverted,
    status: 'rolled_back'
  };
}

/**
 * 批量导入淘宝元器件订单 (智能匹配累加或新建，记录批次快照与订单溯源)
 */
async function batchImportTaobaoComponents(items = [], defaultLocation = '淘宝待整理散料盒', filename = '淘宝订单导入.xlsx') {
  const database = getDb();
  const batchId = `TB_${Date.now()}`;
  const summary = {
    batchId,
    total: items.length,
    mergedCount: 0,
    createdCount: 0,
    totalPieces: 0,
    details: []
  };

  const snapshot = [];

  for (const item of items) {
    const qty = parseInt(item.quantity, 10) || 1;
    summary.totalPieces += qty;
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

    const orderPart = item.order_id ? `[订单号:${item.order_id}] ` : '';

    if (found) {
      const newQty = (found.quantity || 0) + qty;
      await new Promise((resolve, reject) => {
        database.run(
          `UPDATE components SET quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          [newQty, found.id],
          (err) => (err ? reject(err) : resolve())
        );
      });
      addStockLog(found.id, found.name, qty, newQty, 'ENTRY', `淘宝订单导入累加 ${orderPart}[批次:${batchId}] (实得+${qty}件)`);
      summary.mergedCount++;
      summary.details.push({
        status: 'merged',
        id: found.id,
        name: found.name,
        category: found.category,
        addedQty: qty,
        resultQty: newQty,
        location: found.location || defaultLocation
      });
      snapshot.push({
        component_id: found.id,
        name: found.name,
        is_new: false,
        qty_added: qty,
        prev_qty: found.quantity || 0,
        new_qty: newQty,
        location: found.location || defaultLocation,
        order_id: item.order_id || ''
      });
    } else {
      const loc = item.location || defaultLocation;
      const created = await createComponent({
        name: item.name,
        category: item.category || '其他',
        package: item.package || '通用规格',
        value: item.value || '',
        standard_value: item.standard_value || null,
        unit: item.unit || '',
        voltage: item.voltage || null,
        tolerance: item.tolerance || '',
        quantity: qty,
        location: loc,
        notes: item.notes || '淘宝散料采购',
        tags: item.order_id ? `淘宝导入,${item.order_id}` : '淘宝导入'
      });
      addStockLog(created.id, created.name, qty, qty, 'ENTRY', `淘宝订单新入库 ${orderPart}[批次:${batchId}] (实得+${qty}件)`);
      summary.createdCount++;
      summary.details.push({
        status: 'created',
        id: created.id,
        name: created.name,
        category: created.category,
        addedQty: qty,
        resultQty: qty,
        location: loc
      });
      snapshot.push({
        component_id: created.id,
        name: created.name,
        is_new: true,
        qty_added: qty,
        prev_qty: 0,
        new_qty: qty,
        location: loc,
        order_id: item.order_id || ''
      });
    }
  }

  // 记录到 import_batches
  const orderIds = Array.from(new Set(items.map(i => i.order_id).filter(Boolean)));
  await new Promise((resolve, reject) => {
    database.run(
      `INSERT INTO import_batches (id, filename, total_items, total_pieces, order_ids, status, snapshot)
       VALUES (?, ?, ?, ?, ?, 'active', ?)`,
      [batchId, filename, items.length, summary.totalPieces, JSON.stringify(orderIds), JSON.stringify(snapshot)],
      (err) => (err ? reject(err) : resolve())
    );
  });

  return summary;
}

/**
 * ========================================================
 * 制作项目与套料包管理 (Project & Kit Manager)
 * ========================================================
 */

// 1. 创建项目
function createProject(projectData, items = [], autoLock = true) {
  return new Promise((resolve, reject) => {
    const database = getDb();
    const {
      name,
      description = '',
      target_qty = 1,
      bom_filename = '',
      status = 'PREPARING'
    } = projectData;

    database.run(
      `INSERT INTO projects (name, description, target_qty, status, bom_filename, updated_at)
       VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [name, description, parseInt(target_qty, 10) || 1, status, bom_filename],
      function (err) {
        if (err) return reject(err);
        const projectId = this.lastID;

        if (!items || items.length === 0) {
          return resolve({ id: projectId, name, target_qty, items_count: 0 });
        }

        database.serialize(() => {
          const stmt = database.prepare(`
            INSERT INTO project_items (
              project_id, component_id, part_name, package, unit_demand_qty, total_demand_qty, locked_qty, designators, status
            ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)
          `);

          const targetMultiplier = parseInt(target_qty, 10) || 1;
          for (const it of items) {
            const unitDemand = parseInt(it.unit_demand_qty || it.qty || 1, 10) || 1;
            const totalDemand = unitDemand * targetMultiplier;
            const compId = it.component_id ? parseInt(it.component_id, 10) : null;
            const pName = it.part_name || it.name || '';
            const pkg = it.package || '';
            const desig = it.designators || it.refs || '';
            const itemStatus = compId ? 'SHORTAGE' : 'UNMATCHED';
            stmt.run([projectId, compId, pName, pkg, unitDemand, totalDemand, desig, itemStatus]);
          }

          stmt.finalize(async (stmtErr) => {
            if (stmtErr) return reject(stmtErr);

            if (autoLock) {
              try {
                await lockProjectStock(projectId);
              } catch (e) {
                console.error('自动锁库出错:', e);
              }
            }

            const detail = await getProjectDetail(projectId);
            resolve(detail);
          });
        });
      }
    );
  });
}

// 2. 获取项目列表
function getProjectsList(filterStatus = '') {
  return new Promise((resolve, reject) => {
    const database = getDb();
    let sql = `
      SELECT 
        p.*,
        COUNT(pi.id) AS total_items_count,
        SUM(CASE WHEN pi.locked_qty >= pi.total_demand_qty AND pi.total_demand_qty > 0 THEN 1 ELSE 0 END) AS ready_items_count,
        SUM(CASE WHEN pi.locked_qty < pi.total_demand_qty THEN 1 ELSE 0 END) AS shortage_items_count,
        COALESCE(SUM(pi.total_demand_qty), 0) AS total_pieces_demand,
        COALESCE(SUM(pi.locked_qty), 0) AS total_pieces_locked
      FROM projects p
      LEFT JOIN project_items pi ON p.id = pi.project_id
      WHERE 1=1
    `;
    const args = [];
    if (filterStatus) {
      sql += ` AND p.status = ?`;
      args.push(filterStatus);
    }
    sql += `
      GROUP BY p.id
      ORDER BY 
        (CASE WHEN p.status = 'READY' THEN 1 WHEN p.status = 'PREPARING' THEN 2 WHEN p.status = 'BUILDING' THEN 3 WHEN p.status = 'COMPLETED' THEN 4 ELSE 5 END),
        p.updated_at DESC, p.id DESC
    `;

    database.all(sql, args, (err, rows) => {
      if (err) return reject(err);
      const list = (rows || []).map(row => {
        const total = row.total_items_count || 0;
        const ready = row.ready_items_count || 0;
        const readiness = total > 0 ? Math.round((ready / total) * 100) : 0;
        return {
          ...row,
          readiness_percent: readiness
        };
      });
      resolve(list);
    });
  });
}

// 3. 获取单项目完整详情
function getProjectDetail(projectId) {
  return new Promise((resolve, reject) => {
    const database = getDb();
    database.get(`SELECT * FROM projects WHERE id = ?`, [projectId], (pErr, project) => {
      if (pErr) return reject(pErr);
      if (!project) return resolve(null);

      const itemsSql = `
        SELECT 
          pi.*,
          c.name AS comp_name,
          c.category AS comp_category,
          c.package AS comp_package,
          c.location AS comp_location,
          c.lcsc_part AS comp_lcsc,
          COALESCE(c.quantity, 0) AS comp_total_stock,
          COALESCE((
            SELECT SUM(other_pi.locked_qty)
            FROM project_items other_pi
            JOIN projects other_p ON other_pi.project_id = other_p.id
            WHERE other_pi.component_id = pi.component_id 
              AND other_p.status IN ('PREPARING', 'READY', 'BUILDING')
              AND other_pi.id != pi.id
          ), 0) AS other_locked_qty
        FROM project_items pi
        LEFT JOIN components c ON pi.component_id = c.id
        WHERE pi.project_id = ?
        ORDER BY (pi.locked_qty >= pi.total_demand_qty) ASC, pi.id ASC
      `;

      database.all(itemsSql, [projectId], (iErr, items) => {
        if (iErr) return reject(iErr);

        const enrichedItems = (items || []).map(item => {
          const compStock = item.comp_total_stock || 0;
          const otherLocked = item.other_locked_qty || 0;
          const availableForThis = Math.max(0, compStock - otherLocked);
          const shortage = Math.max(0, item.total_demand_qty - item.locked_qty);
          const isReady = item.locked_qty >= item.total_demand_qty && item.total_demand_qty > 0;

          return {
            ...item,
            available_for_this: availableForThis,
            shortage_qty: shortage,
            is_ready: isReady
          };
        });

        const totalItems = enrichedItems.length;
        const readyItems = enrichedItems.filter(i => i.is_ready).length;
        const shortageItems = totalItems - readyItems;
        const totalPiecesDemand = enrichedItems.reduce((acc, i) => acc + (i.total_demand_qty || 0), 0);
        const totalPiecesLocked = enrichedItems.reduce((acc, i) => acc + (i.locked_qty || 0), 0);
        const readinessPercent = totalItems > 0 ? Math.round((readyItems / totalItems) * 100) : 0;

        resolve({
          ...project,
          total_items_count: totalItems,
          ready_items_count: readyItems,
          shortage_items_count: shortageItems,
          total_pieces_demand: totalPiecesDemand,
          total_pieces_locked: totalPiecesLocked,
          readiness_percent: readinessPercent,
          items: enrichedItems
        });
      });
    });
  });
}

// 4. 更新项目基础信息
function updateProject(projectId, updateData) {
  return new Promise(async (resolve, reject) => {
    const database = getDb();
    const { name, description, target_qty, status } = updateData;

    database.get(`SELECT * FROM projects WHERE id = ?`, [projectId], (err, oldProject) => {
      if (err) return reject(err);
      if (!oldProject) return reject(new Error('项目不存在'));

      const newTarget = target_qty !== undefined ? Math.max(1, parseInt(target_qty, 10)) : oldProject.target_qty;
      const targetChanged = newTarget !== oldProject.target_qty;

      const newName = name !== undefined ? name : oldProject.name;
      const newDesc = description !== undefined ? description : oldProject.description;
      const newStatus = status !== undefined ? status : oldProject.status;

      database.run(
        `UPDATE projects SET name = ?, description = ?, target_qty = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [newName, newDesc, newTarget, newStatus, projectId],
        function (uErr) {
          if (uErr) return reject(uErr);

          if (!targetChanged) {
            return getProjectDetail(projectId).then(resolve).catch(reject);
          }

          database.run(
            `UPDATE project_items SET total_demand_qty = unit_demand_qty * ? WHERE project_id = ?`,
            [newTarget, projectId],
            async (itemErr) => {
              if (itemErr) return reject(itemErr);
              await reevaluateProjectStatus(projectId);
              const detail = await getProjectDetail(projectId);
              resolve(detail);
            }
          );
        }
      );
    });
  });
}

// 5. 智能预锁库存
function lockProjectStock(projectId) {
  return new Promise(async (resolve, reject) => {
    const detail = await getProjectDetail(projectId);
    if (!detail) return reject(new Error('项目不存在'));

    const database = getDb();
    database.serialize(() => {
      const updateStmt = database.prepare(
        `UPDATE project_items SET locked_qty = ?, status = ? WHERE id = ?`
      );

      for (const item of detail.items) {
        if (!item.component_id) continue;
        const available = item.available_for_this || 0;
        const need = item.total_demand_qty;
        const newLock = Math.min(need, available);
        const newStatus = newLock >= need ? 'READY' : 'SHORTAGE';
        updateStmt.run([newLock, newStatus, item.id]);
      }

      updateStmt.finalize(async (err) => {
        if (err) return reject(err);
        await reevaluateProjectStatus(projectId);
        const updated = await getProjectDetail(projectId);
        resolve(updated);
      });
    });
  });
}

// 6. 一键释放预锁
function unlockProjectStock(projectId) {
  return new Promise((resolve, reject) => {
    const database = getDb();
    database.run(
      `UPDATE project_items SET locked_qty = 0, status = 'SHORTAGE' WHERE project_id = ?`,
      [projectId],
      async (err) => {
        if (err) return reject(err);
        await reevaluateProjectStatus(projectId);
        const detail = await getProjectDetail(projectId);
        resolve(detail);
      }
    );
  });
}

// 7. 完工正式消库
function completeProject(projectId) {
  return new Promise(async (resolve, reject) => {
    const detail = await getProjectDetail(projectId);
    if (!detail) return reject(new Error('项目不存在'));
    if (detail.status === 'COMPLETED') return reject(new Error('该项目已处于完工状态'));

    const database = getDb();
    database.run('BEGIN TRANSACTION', async (beginErr) => {
      if (beginErr) return reject(beginErr);

      try {
        for (const item of detail.items) {
          const deductQty = item.locked_qty || 0;
          if (item.component_id && deductQty > 0) {
            await new Promise((res, rej) => {
              database.run(
                `UPDATE components SET quantity = MAX(0, quantity - ?), updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
                [deductQty, item.component_id],
                function (err) {
                  if (err) return rej(err);
                  database.get(`SELECT quantity, name FROM components WHERE id = ?`, [item.component_id], (e, r) => {
                    if (r) {
                      addStockLog(item.component_id, r.name, -deductQty, r.quantity, 'PROJECT_BUILD', `项目【${detail.name}】完工投产消库 (-${deductQty})`);
                    }
                    res();
                  });
                }
              );
            });
          }
        }

        await new Promise((res, rej) => {
          database.run(
            `UPDATE project_items SET locked_qty = 0 WHERE project_id = ?`,
            [projectId],
            (err) => (err ? rej(err) : res())
          );
        });

        await new Promise((res, rej) => {
          database.run(
            `UPDATE projects SET status = 'COMPLETED', completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            [projectId],
            (err) => (err ? rej(err) : res())
          );
        });

        database.run('COMMIT', async (commitErr) => {
          if (commitErr) return reject(commitErr);
          const finished = await getProjectDetail(projectId);
          resolve(finished);
        });
      } catch (err) {
        database.run('ROLLBACK', () => reject(err));
      }
    });
  });
}

// 8. 删除项目
function deleteProject(projectId) {
  return new Promise((resolve, reject) => {
    const database = getDb();
    database.run(`DELETE FROM project_items WHERE project_id = ?`, [projectId], (err) => {
      if (err) return reject(err);
      database.run(`DELETE FROM projects WHERE id = ?`, [projectId], (pErr) => {
        if (pErr) return reject(pErr);
        resolve({ success: true, id: projectId });
      });
    });
  });
}

// 9. 重新评估项目整体状态
function reevaluateProjectStatus(projectId) {
  return new Promise((resolve, reject) => {
    const database = getDb();
    database.all(`SELECT total_demand_qty, locked_qty FROM project_items WHERE project_id = ?`, [projectId], (err, rows) => {
      if (err) return reject(err);
      if (!rows || rows.length === 0) return resolve();

      const allReady = rows.every(r => r.locked_qty >= r.total_demand_qty && r.total_demand_qty > 0);
      const newStatus = allReady ? 'READY' : 'PREPARING';

      database.run(
        `UPDATE projects SET status = CASE WHEN status IN ('COMPLETED', 'BUILDING') THEN status ELSE ? END, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [newStatus, projectId],
        (uErr) => (uErr ? reject(uErr) : resolve())
      );
    });
  });
}

// 10. 提取项目专属采购缺料清单
function getProjectPurchaseList(projectId) {
  return new Promise(async (resolve, reject) => {
    const detail = await getProjectDetail(projectId);
    if (!detail) return reject(new Error('项目不存在'));

    const shortages = (detail.items || []).filter(i => (i.total_demand_qty - i.locked_qty) > 0);
    const textLines = shortages.map(i => {
      const need = i.total_demand_qty - i.locked_qty;
      const desig = i.designators ? ` (${i.designators})` : '';
      return `${i.part_name} ${i.package || ''} * ${need}${desig}`;
    });

    resolve({
      project_name: detail.name,
      total_shortage_items: shortages.length,
      shortages,
      purchase_text: textLines.join('\n')
    });
  });
}

// 11. 往已有项目添加单个元器件
function addProjectItem(projectId, itemData) {
  return new Promise(async (resolve, reject) => {
    const database = getDb();
    database.get(`SELECT target_qty FROM projects WHERE id = ?`, [projectId], (pErr, project) => {
      if (pErr) return reject(pErr);
      if (!project) return reject(new Error('项目不存在'));

      const targetQty = project.target_qty || 1;
      const unitDemand = Math.max(1, parseInt(itemData.unit_demand_qty || 1, 10) || 1);
      const totalDemand = unitDemand * targetQty;
      const compId = itemData.component_id ? parseInt(itemData.component_id, 10) : null;
      const partName = itemData.part_name || itemData.name || '';
      const pkg = itemData.package || '';
      const desig = itemData.designators || '';
      const status = compId ? 'SHORTAGE' : 'UNMATCHED';

      database.run(
        `INSERT INTO project_items (
          project_id, component_id, part_name, package, unit_demand_qty, total_demand_qty, locked_qty, designators, status
        ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`,
        [projectId, compId, partName, pkg, unitDemand, totalDemand, desig, status],
        async function (err) {
          if (err) return reject(err);
          // 自动为新加的料尝试锁库
          if (compId) {
            try {
              await lockProjectStock(projectId);
            } catch (e) {}
          } else {
            await reevaluateProjectStatus(projectId);
          }
          const detail = await getProjectDetail(projectId);
          resolve(detail);
        }
      );
    });
  });
}

// 12. 从项目移除单个元器件
function removeProjectItem(projectId, itemId) {
  return new Promise((resolve, reject) => {
    const database = getDb();
    database.run(
      `DELETE FROM project_items WHERE id = ? AND project_id = ?`,
      [itemId, projectId],
      async (err) => {
        if (err) return reject(err);
        await reevaluateProjectStatus(projectId);
        const detail = await getProjectDetail(projectId);
        resolve(detail);
      }
    );
  });
}

// 13. 更新项目中某个元器件的用量等
function updateProjectItem(projectId, itemId, updateData) {
  return new Promise(async (resolve, reject) => {
    const database = getDb();
    database.get(`SELECT target_qty FROM projects WHERE id = ?`, [projectId], async (pErr, project) => {
      if (pErr) return reject(pErr);
      if (!project) return reject(new Error('项目不存在'));

      const targetQty = project.target_qty || 1;
      const unitDemand = updateData.unit_demand_qty !== undefined 
        ? Math.max(1, parseInt(updateData.unit_demand_qty, 10) || 1) 
        : null;

      const setClauses = [];
      const args = [];

      if (unitDemand !== null) {
        setClauses.push('unit_demand_qty = ?', 'total_demand_qty = ?');
        args.push(unitDemand, unitDemand * targetQty);
      }

      if (updateData.designators !== undefined) {
        setClauses.push('designators = ?');
        args.push(updateData.designators);
      }

      if (setClauses.length === 0) {
        const detail = await getProjectDetail(projectId);
        return resolve(detail);
      }

      const sql = `UPDATE project_items SET ${setClauses.join(', ')} WHERE id = ? AND project_id = ?`;
      args.push(itemId, projectId);

      database.run(sql, args, async (err) => {
        if (err) return reject(err);
        await lockProjectStock(projectId);
        const detail = await getProjectDetail(projectId);
        resolve(detail);
      });
    });
  });
}

// 14. 智能寻找工坊可用替代料
function findProjectItemAlternatives(projectId, itemId) {
  return new Promise(async (resolve, reject) => {
    try {
      const database = getDb();
      database.get(`SELECT * FROM project_items WHERE id = ? AND project_id = ?`, [itemId, projectId], async (iErr, item) => {
        if (iErr) return reject(iErr);
        if (!item) return reject(new Error('未找到该物料项'));

        const shortageQty = Math.max(0, item.total_demand_qty - item.locked_qty);
        // 解析物料特征
        const parsed = parseComponentText(`${item.part_name} ${item.package || ''}`);
        const itemPkg = normalizePackage(item.package) || normalizePackage(parsed.package) || '';

        // 查询全库物料（带可用量计算）
        const allStock = await searchComponents({});
        const candidates = [];

        // 知名等价替代族谱映射 (pin-to-pin compatible)
        const equivFamilies = [
          ['AMS1117-3.3', 'LM1117-3.3', 'ME6211C33', 'XC6206P332MR', 'RT9193-33'],
          ['AMS1117-5.0', 'LM1117-5.0', 'CJ1117-5.0'],
          ['AMS1117-ADJ', 'LM1117-ADJ'],
          ['CH340C', 'CH340N', 'CH340E', 'CH340G', 'CP2102', 'FT232RL'],
          ['AO3400', 'AO3400A', 'SI2302', 'SI2302CDS', 'IRLML2502'],
          ['AO3401', 'AO3401A', 'SI2301', 'SI2301CDS'],
          ['SS34', 'SK34', 'B340', 'SS340', '1N5822'],
          ['SS14', 'SK14', 'B140', '1N5819'],
          ['1N4148', '1N4148W', '1N4148WS', '1N4148WT'],
          ['ESP32-WROOM-32', 'ESP32-WROOM-32D', 'ESP32-WROOM-32E', 'ESP32-WROOM-32UE']
        ];

        function getEquivFamily(name) {
          const clean = (name || '').toUpperCase().replace(/[^A-Z0-9\.\-]/g, '');
          for (const fam of equivFamilies) {
            if (fam.some(f => clean.includes(f.toUpperCase()) || f.toUpperCase().includes(clean))) {
              return fam;
            }
          }
          return null;
        }

        const itemFam = getEquivFamily(item.part_name);

        for (const stock of allStock) {
          // 排除当前已关联的本身，且必须有现货可用 (available_quantity > 0)
          if (stock.id === item.component_id) continue;
          if ((stock.available_quantity || 0) <= 0) continue;

          const stockPkg = normalizePackage(stock.package) || '';
          const pkgMatched = !itemPkg || !stockPkg || itemPkg === stockPkg;
          let matchGrade = null;
          let gradeLabel = '';
          let reason = '';
          let rank = 99;

          // 1. 电阻比对
          if (
            (parsed.category === '电阻' || stock.category === '电阻') &&
            parsed.standard_value !== null &&
            stock.standard_value !== null &&
            parsed.standard_value === stock.standard_value
          ) {
            if (pkgMatched) {
              matchGrade = 'A';
              gradeLabel = '✨ 同值同封装完美平替';
              reason = `阻值 ${stock.value} 完全一致，封装 ${stock.package || '相同'}，现有可用库存充足，即贴即用`;
              rank = 1;
            } else {
              matchGrade = 'B';
              gradeLabel = '⚡ 同阻值不同封装';
              reason = `阻值 ${stock.value} 完全一致，封装为【${stock.package || '异形'}】(原需 ${item.package || '未标'})，焊盘多可手工兼容`;
              rank = 2;
            }
          }

          // 2. 电容比对
          else if (
            (parsed.category === '电容' || stock.category === '电容') &&
            parsed.standard_value !== null &&
            stock.standard_value !== null &&
            parsed.standard_value === stock.standard_value
          ) {
            const stockV = stock.voltage || 0;
            const itemV = parsed.voltage || 0;

            if (pkgMatched) {
              if (stockV >= itemV) {
                matchGrade = 'A';
                gradeLabel = itemV > 0 && stockV > itemV ? '✨ 高耐压向下兼容 (优选)' : '✨ 同规格同封装完美平替';
                reason = `容值 ${stock.value} 一致，耐压 ${stockV ? stockV + 'V' : '标称'} ${stockV > itemV ? '高于原要求' : '合规'}，性能更稳定且完全向下平替`;
                rank = 1;
              } else if (stockV < itemV && stockV > 0) {
                matchGrade = 'C';
                gradeLabel = '⚠️ 耐压较低备选';
                reason = `容值相同但耐压仅 ${stockV}V (原需 ${itemV}V)，仅限低压弱电电路临时验证`;
                rank = 4;
              } else {
                matchGrade = 'A';
                gradeLabel = '✨ 同容值同封装平替';
                reason = `容值 ${stock.value} 与封装完全一致，工坊现货充足`;
                rank = 1;
              }
            } else {
              matchGrade = 'B';
              gradeLabel = '⚡ 同容值不同封装';
              reason = `容值 ${stock.value} 一致，耐压 ${stockV || '常规'}V，封装为【${stock.package || '异形'}】`;
              rank = 3;
            }
          }

          // 3. 芯片 / 二极管 / MOS / 稳压LDO / 常见器件 族谱与引脚兼容比对
          else if (itemFam) {
            const stockFam = getEquivFamily(stock.name) || getEquivFamily(stock.value);
            if (stockFam && stockFam === itemFam) {
              matchGrade = pkgMatched ? 'A' : 'B';
              gradeLabel = pkgMatched ? '✨ 引脚功能等价兼容 IC' : '⚡ 同功能兼容 IC (封装不同)';
              reason = `芯片核心功能与引脚定义兼容 (${stock.name})，常用于同方案互换`;
              rank = pkgMatched ? 1 : 2;
            }
          }

          // 4. 型号名称相近字符模糊探测 (如 AMS1117-3.3 匹配 1117 3.3V)
          else if (parsed.name && stock.name) {
            const cleanItemName = parsed.name.toUpperCase().replace(/[^A-Z0-9]/g, '');
            const cleanStockName = stock.name.toUpperCase().replace(/[^A-Z0-9]/g, '');
            if (cleanItemName.length >= 4 && cleanStockName.length >= 4) {
              if (cleanStockName.includes(cleanItemName) || cleanItemName.includes(cleanStockName)) {
                matchGrade = pkgMatched ? 'B' : 'C';
                gradeLabel = '💡 相似型号可用现货';
                reason = `型号特征高度匹配【${stock.name}】，封装: ${stock.package || '未标'}`;
                rank = pkgMatched ? 2 : 3;
              }
            }
          }

          if (matchGrade) {
            candidates.push({
              id: stock.id,
              name: stock.name,
              category: stock.category,
              package: stock.package || '',
              value: stock.value || '',
              location: stock.location || '随手放置',
              quantity: stock.quantity || 0,
              available_quantity: stock.available_quantity || 0,
              match_grade: matchGrade,
              grade_label: gradeLabel,
              reason: reason,
              rank: rank,
              can_fully_cover: stock.available_quantity >= shortageQty
            });
          }
        }

        candidates.sort((a, b) => {
          if (a.rank !== b.rank) return a.rank - b.rank;
          if (a.can_fully_cover !== b.can_fully_cover) return a.can_fully_cover ? -1 : 1;
          return b.available_quantity - a.available_quantity;
        });

        resolve({
          item: {
            id: item.id,
            part_name: item.part_name,
            package: item.package,
            unit_demand_qty: item.unit_demand_qty,
            total_demand_qty: item.total_demand_qty,
            locked_qty: item.locked_qty,
            shortage_qty: shortageQty,
            component_id: item.component_id
          },
          alternatives: candidates.slice(0, 10)
        });
      });
    } catch (err) {
      reject(err);
    }
  });
}

// 15. 一键采用替代料
function applyProjectItemAlternative(projectId, itemId, newComponentId) {
  return new Promise(async (resolve, reject) => {
    const database = getDb();
    database.get(`SELECT * FROM components WHERE id = ?`, [newComponentId], (cErr, newComp) => {
      if (cErr) return reject(cErr);
      if (!newComp) return reject(new Error('所选替代物料不存在'));

      database.get(`SELECT * FROM project_items WHERE id = ? AND project_id = ?`, [itemId, projectId], (iErr, item) => {
        if (iErr) return reject(iErr);
        if (!item) return reject(new Error('未找到项目物料'));

        const newDesignators = item.designators 
          ? `${item.designators} [平替:${newComp.name}]` 
          : `[平替:${newComp.name}]`;

        database.run(
          `UPDATE project_items SET 
            component_id = ?, 
            package = COALESCE(NULLIF(package, ''), ?),
            designators = ?,
            status = 'SHORTAGE'
           WHERE id = ? AND project_id = ?`,
          [newComponentId, newComp.package || '', newDesignators, itemId, projectId],
          async (uErr) => {
            if (uErr) return reject(uErr);
            database.run(`UPDATE projects SET updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [projectId], async () => {
              try {
                await lockProjectStock(projectId);
              } catch (e) {}
              const detail = await getProjectDetail(projectId);
              resolve(detail);
            });
          }
        );
      });
    });
  });
}

module.exports = {
  getDb,
  initDb,
  searchComponents,
  getComponentById,
  createComponent,
  updateComponent,
  adjustQuantity,
  deleteComponent,
  getFrequentLocations,
  getCategoryStats,
  batchDeduct,
  exportAll,
  seedCommonPresets,
  getBoxesSummary,
  getBoxItems,
  getStockLogs,
  getLowStockList,
  addStockLog,
  getActiveImportedOrderMap,
  getImportBatches,
  rollbackImportBatch,
  batchImportTaobaoComponents,
  // 制作项目模块接口
  createProject,
  getProjectsList,
  getProjectDetail,
  updateProject,
  lockProjectStock,
  unlockProjectStock,
  completeProject,
  deleteProject,
  getProjectPurchaseList,
  addProjectItem,
  removeProjectItem,
  updateProjectItem,
  findProjectItemAlternatives,
  applyProjectItemAlternative
};


