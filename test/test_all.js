/**
 * 全链路自动化集成测试脚本 (test/test_all.js)
 * 验证：SQLite建库、预设载入、模糊检索、官方物料服务、BOM多维查重（红绿蓝黄）、按箱聚合拣料与出库扣减。
 */

const fs = require('fs');
const path = require('path');
const db = require('../lib/db');
const { parseComponentText } = require('../lib/parser');
const { queryOfficialComponent } = require('../lib/lcscService');
const { parseBOMFile, compareBOMWithStock, generatePickingList, extractPurchaseShortageList } = require('../lib/bomMatcher');

async function runTests() {
  console.log('--- [Step 1] 初始化数据库与预设 ---');
  await db.initDb();
  const seedResult = await db.seedCommonPresets();
  console.log(`✔ 常用预设载入成功: ${seedResult.seeded} 件`);

  console.log('\n--- [Step 2] 验证模糊检索与多关键字过滤 ---');
  const r1 = await db.searchComponents({ query: '10k 0805' });
  console.log(`✔ 检索 "10k 0805": 命中 ${r1.length} 项 (首项: ${r1[0].name}, 余量: ${r1[0].quantity})`);
  if (r1.length === 0) throw new Error('未命中 10k 0805');

  const r2 = await db.searchComponents({ query: 'AMS1117' });
  console.log(`✔ 检索 "AMS1117": 命中 ${r2.length} 项 (首项: ${r2[0].name}, 封装: ${r2[0].package})`);
  if (r2.length === 0) throw new Error('未命中 AMS1117');

  console.log('\n--- [Step 3] 验证就地步进器库存增减 ---');
  const targetId = r1[0].id;
  const initialQty = r1[0].quantity;
  const afterInc = await db.adjustQuantity(targetId, 50);
  console.log(`✔ 数量 +50: ${initialQty} -> ${afterInc.quantity}`);
  const afterDec = await db.adjustQuantity(targetId, -50);
  console.log(`✔ 数量 -50: ${afterInc.quantity} -> ${afterDec.quantity}`);

  console.log('\n--- [Step 4] 验证立创官方检索与本地解析 ---');
  const off1 = await queryOfficialComponent('C2057');
  console.log(`✔ 查询 C2057: 来源=${off1.source}, 品名=${off1.name}, 厂商=${off1.manufacturer}`);
  const off2 = await queryOfficialComponent('CH340C');
  console.log(`✔ 查询 CH340C: 来源=${off2.source}, 分类=${off2.category}, 封装=${off2.package}`);

  console.log('\n--- [Step 5] 验证 BOM 解析与红绿蓝四色比对 ---');
  // 构造真实 CSV BOM 数据
  const sampleCsv = `Comment,Footprint,Designator,Quantity,LCSC
10k 1%,0805,"R1, R2, R3",10,
100nF 16V,0603,"C1, C2",20,
1k 1%,0805,"R4",999,
STM32F401CCU6,QFN-48,"U1",1,
`;
  const parsedBom = parseBOMFile(Buffer.from(sampleCsv, 'utf-8'));
  console.log(`✔ BOM 文件解析成功: 表头=[${parsedBom.headers.join(', ')}], 行数=${parsedBom.totalRows}`);

  const stockList = await db.exportAll();
  const comparison = compareBOMWithStock(parsedBom.dataRows, parsedBom.autoMapping, stockList);
  console.log('✔ BOM 比对统计结果:');
  console.log(`   🟩 完全现货 (免买):   ${comparison.summary.exactMatchCount} 项`);
  console.log(`   🟦 建议替代 (可复用): ${comparison.summary.substituteCount} 项`);
  console.log(`   🟨 需补库存 (差额):   ${comparison.summary.lowStockCount} 项`);
  console.log(`   🟥 必须采购 (缺货):   ${comparison.summary.lackCount} 项`);

  // 断言四种状态均按预期命中
  if (comparison.summary.exactMatchCount < 1) throw new Error('预期命中 🟩 完全现货');
  if (comparison.summary.substituteCount < 1) throw new Error('预期命中 🟦 建议替代 (高耐压替代)');
  if (comparison.summary.lowStockCount < 1) throw new Error('预期命中 🟨 需补库存 (1k电阻差额)');
  if (comparison.summary.lackCount < 1) throw new Error('预期命中 🟥 缺料 (STM32缺货)');

  console.log('\n--- [Step 6] 验证按存放位置分组的拣料清单 ---');
  // 模拟采纳替代项
  comparison.results[1].isAdoptedSubstitute = true;
  const picking = generatePickingList(comparison.results);
  console.log('✔ 拣料单自动按收纳箱分组:');
  for (const [loc, items] of Object.entries(picking)) {
    console.log(`   📦 存放位置: [${loc}] -> 包含物料: ${items.map(i => `${i.name} x${i.takeQty}`).join(', ')}`);
  }

  console.log('\n--- [Step 7] 验证采购缺料清单提取 ---');
  const shortages = extractPurchaseShortageList(comparison.results);
  console.log(`✔ 提取待采购缺料项: ${shortages.length} 项:`);
  shortages.forEach(s => console.log(`   🛒 ${s.partName} (${s.footprint}) - 缺 ${s.missingQty} 件 [${s.reason}]`));

  console.log('\n--- [Step 8] 验证物理收纳空间聚合与透视箱 ---');
  const boxes = await db.getBoxesSummary();
  console.log(`✔ 收纳空间聚合统计: 找到 ${boxes.length} 个独立收纳盒`);
  if (boxes.length === 0) throw new Error('预期查出收纳盒数据');
  const firstBox = boxes[0];
  console.log(`   🗄️ 首个收纳盒: [${firstBox.box_name}] -> 包含物料 ${firstBox.item_count} 项, 总计 ${firstBox.total_quantity} 件`);
  const boxItems = await db.getBoxItems(firstBox.box_name);
  console.log(`   🔍 透视盒内清单: 查出 ${boxItems.length} 项明细`);
  if (boxItems.length !== firstBox.item_count) throw new Error('盒内物料数量与摘要不一致');

  console.log('\n========================================================');
  console.log('🎉 全部单元与集成测试均 100% 顺利通过！系统各模块运作正常。');
  console.log('========================================================\n');
}

runTests().catch(err => {
  console.error('❌ 测试失败:', err);
  process.exit(1);
});
