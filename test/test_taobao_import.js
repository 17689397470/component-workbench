/**
 * 淘宝订单解析与批量入库端到端测试 (test/test_taobao_import.js)
 */

const fs = require('fs');
const path = require('path');
const db = require('../lib/db');
const { parseTaobaoOrderFile } = require('../lib/taobaoParser');
const http = require('http');

async function testParser() {
  console.log('=== [Step 1] 验证淘宝订单文件解析 ===');
  const xlsxPath = path.join(__dirname, '..', '订单数据.xlsx');
  if (!fs.existsSync(xlsxPath)) {
    throw new Error('未找到 订单数据.xlsx 文件！');
  }

  const fileBuf = fs.readFileSync(xlsxPath);
  const items = parseTaobaoOrderFile(fileBuf);

  const totalParsedPieces = items.reduce((acc, cur) => acc + (cur.quantity || 0), 0);
  console.log(`✔ 读取到 ${items.length} 项物料`);
  console.log(`✔ 识别有效物料总真实件数: ${totalParsedPieces}`);

  if (items.length !== 26) {
    throw new Error(`预期 26 项物料，实际得到 ${items.length}`);
  }

  // 抽查 100nF 电容
  const cap100nf = items.find(i => i.name && i.name.includes('100nF'));
  if (!cap100nf) throw new Error('未识别到 100nF 电容');
  console.log(`✔ 抽查 100nF: 封装=${cap100nf.package}, 包装倍数=${cap100nf.unit_multiplier}件/包, 换算入库件数=${cap100nf.quantity}`);

  // 抽查 AMS1117 或芯片
  const ldo = items.find(i => i.name && i.name.includes('1117'));
  if (ldo) {
    console.log(`✔ 抽查 LDO: 名称=${ldo.name}, 封装=${ldo.package}, 入库件数=${ldo.quantity}`);
  }
}

async function testApiPreview() {
  console.log('\n=== [Step 2] 验证 /api/taobao/preview 后端接口 ===');
  const postData = JSON.stringify({ use_default: true });

  const res = await new Promise((resolve, reject) => {
    const req = http.request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/taobao/preview',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve({ statusCode: res.statusCode, data: JSON.parse(body) }));
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });

  if (res.statusCode !== 200 || !res.data.success) {
    throw new Error(`API 返回失败: ${JSON.stringify(res.data)}`);
  }

  const items = res.data.data;
  const totalPieces = items.reduce((acc, cur) => acc + (cur.quantity || 0), 0);
  console.log(`✔ 接口响应成功: 解析出 ${items.length} 项，共 ${totalPieces} 件`);
  const willMergeCount = items.filter(i => i.will_merge).length;
  console.log(`✔ 预检智能合并: ${willMergeCount} 项在现有库存中已有同款，将自动累加`);
  return items;
}

async function testApiConfirm(items) {
  console.log('\n=== [Step 3] 验证 /api/taobao/confirm 批量入库接口 ===');
  const postData = JSON.stringify({
    items: items,
    defaultLocation: '淘宝测试收纳盒'
  });

  const res = await new Promise((resolve, reject) => {
    const req = http.request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/taobao/confirm',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve({ statusCode: res.statusCode, data: JSON.parse(body) }));
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });

  if (res.statusCode !== 200 || !res.data.success) {
    throw new Error(`批量入库确认失败: ${JSON.stringify(res.data)}`);
  }

  const s = res.data.summary;
  console.log(`✔ 入库成功: 录入总项数=${s.total}, 总件数=${s.totalPieces}, 合并累加=${s.mergedCount}, 新建入库=${s.createdCount}`);
}

async function run() {
  try {
    await testParser();
    const items = await testApiPreview();
    await testApiConfirm(items);
    console.log('\n=========================================');
    console.log('🎉 淘宝订单解析、预览与批量入库全部验证通过！');
    console.log('=========================================');
  } catch (err) {
    console.error('❌ 测试失败:', err);
    process.exit(1);
  }
}

run();
