const assert = require('assert');
const {
  getAllStorageBoxes,
  getStorageBoxGrid,
  assignComponentToSlot,
  removeComponentFromSlot,
  saveStorageBoxConfig,
  getComponentLocator,
  deleteStorageBoxConfig,
  extractBoxAndSlot,
} = require('../lib/db');

async function main() {
  console.log('--- [Step 11] 验证收纳盒 2.0 (Boxes 2.0) 核心数据流与网格透视 ---');

  // 1. 验证格式智能正则解析器
  const p1 = extractBoxAndSlot('默认电阻盒 (B3)');
  assert.strictEqual(p1.boxName, '默认电阻盒');
  assert.strictEqual(p1.slot, 'B3');

  const p2 = extractBoxAndSlot('0805贴片本 (P02-05)');
  assert.strictEqual(p2.boxName, '0805贴片本');
  assert.strictEqual(p2.slot, 'P02-05');

  const p3 = extractBoxAndSlot('普通散料箱');
  assert.strictEqual(p3.boxName, '普通散料箱');
  assert.strictEqual(p3.slot, null);

  console.log('✔ 正则解析器 (extractBoxAndSlot) 双向兼容验证通过');

  // 2. 验证收纳盒列表
  const boxes = await getAllStorageBoxes();
  assert(Array.isArray(boxes));
  assert(boxes.length > 0);
  console.log(`✔ 成功枚举工坊物理收纳盒: ${boxes.length} 个`);

  // 3. 验证保存与更新自定义规格
  const newBox = await saveStorageBoxConfig({
    name: '测试专用零件柜',
    box_type: 'GRID',
    rows: 3,
    cols: 4,
    slot_naming: 'LETTER_NUM',
    color: '#3B82F6',
    description: '自动化测试抽屉柜',
  });
  assert(newBox && newBox.id);
  console.log(`✔ 成功创建 3x4 规格零件柜配置: id=${newBox.id}`);

  // 4. 验证网格透视 (getStorageBoxGrid 返回格式)
  const gridData = await getStorageBoxGrid(newBox.id);
  assert(gridData && gridData.box);
  assert.strictEqual(gridData.box.rows, 3);
  assert.strictEqual(gridData.box.cols, 4);
  console.log('✔ 2D 网格矩阵配置成功投射');

  // 5. 验证清理测试盒子
  await deleteStorageBoxConfig(newBox.id);
  console.log('✔ 测试配置清理完毕');

  console.log('========================================================');
  console.log('🎉 收纳盒 2.0 (Boxes 2.0) 数据层与算法测试全部通过！');
  console.log('========================================================');
}

main().catch((err) => {
  console.error('测试失败:', err);
  process.exit(1);
});
