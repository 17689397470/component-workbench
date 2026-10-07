/**
 * 备份、快照与数据安全恢复集成测试 (test/test_backup_restore.js)
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const db = require('../lib/db');

async function runTests() {
  console.log('--- [Step 1] 初始化数据库 ---');
  await db.initDb();
  const initialComps = await db.searchComponents({});
  console.log(`✔ 当前库存元件数: ${initialComps.length} 件`);

  console.log('\n--- [Step 2] 验证全量数据导出 (exportFullBackup) ---');
  const backup = await db.exportFullBackup();
  assert.ok(backup.meta, '必须包含 meta 信息');
  assert.strictEqual(backup.meta.app, 'component-workbench');
  assert.ok(backup.tables, '必须包含 tables 字典');
  assert.ok(Array.isArray(backup.tables.components), 'components 必须为数组');
  assert.ok(Array.isArray(backup.tables.stock_logs), 'stock_logs 必须为数组');
  assert.ok(Array.isArray(backup.tables.projects), 'projects 必须为数组');
  console.log(`✔ 导出成功: components=${backup.counts.components}, stock_logs=${backup.counts.stock_logs}, projects=${backup.counts.projects}`);

  console.log('\n--- [Step 3] 验证创建本地快照 (createDatabaseSnapshot) ---');
  const snapshotResult = await db.createDatabaseSnapshot('test_unit');
  assert.strictEqual(snapshotResult.success, true);
  assert.ok(fs.existsSync(snapshotResult.filePath), '快照文件必须存在磁盘上');
  console.log(`✔ 快照创建成功: ${snapshotResult.filename} (大小: ${snapshotResult.sizeFormatted})`);

  console.log('\n--- [Step 4] 验证读取快照列表 (listDatabaseSnapshots) ---');
  const snapshots = db.listDatabaseSnapshots();
  assert.ok(snapshots.length > 0, '快照列表中必须有至少一个快照');
  assert.ok(snapshots.some(s => s.filename === snapshotResult.filename), '列表中必须包含刚刚创建的快照');
  console.log(`✔ 成功读取快照列表: 发现 ${snapshots.length} 个快照 (最新: ${snapshots[0].filename})`);

  console.log('\n--- [Step 5] 验证从快照安全回滚 (rollbackFromSnapshot) ---');
  // 创建一个临时物料
  const tempCreated = await db.createComponent({
    name: 'TEST_TEMP_RESISTOR_9999',
    category: '电阻',
    package: '0805',
    value: '9999R',
    quantity: 123
  });
  const afterInsert = await db.searchComponents({ query: 'TEST_TEMP_RESISTOR_9999' });
  assert.strictEqual(afterInsert.length, 1, '临时物料已创建');

  // 回滚到刚刚的快照
  const rollbackRes = await db.rollbackFromSnapshot(snapshotResult.filename);
  assert.strictEqual(rollbackRes.success, true);
  const afterRollback = await db.searchComponents({ query: 'TEST_TEMP_RESISTOR_9999' });
  assert.strictEqual(afterRollback.length, 0, '回滚后临时物料已被正确清除还原');
  console.log(`✔ 回滚验证成功: 临时物料已自动清除，数据库成功还原至快照状态`);

  console.log('\n--- [Step 6] 验证全量导入恢复 (importFullBackup) 及其自动快照保底 ---');
  // 注入一条新物料在 backup 数据中
  const modifiedBackup = JSON.parse(JSON.stringify(backup));
  modifiedBackup.tables.components.push({
    name: 'RESTORED_SPECIAL_CHIP',
    category: '芯片',
    package: 'QFP-64',
    value: 'STM32-TEST',
    standard_value: null,
    unit: '',
    voltage: null,
    tolerance: '',
    quantity: 50,
    location: '快照测试盒',
    lcsc_part: '',
    manufacturer: '',
    image_url: '',
    datasheet_url: '',
    tags: '',
    notes: '恢复测试专用',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  });

  const restoreRes = await db.importFullBackup(modifiedBackup);
  assert.ok(restoreRes.autoSnapshot, '恢复前必须自动生成了快照保底');
  console.log(`✔ 恢复前自动生成保底快照: ${restoreRes.autoSnapshot}`);

  const restoredComp = await db.searchComponents({ query: 'RESTORED_SPECIAL_CHIP' });
  assert.strictEqual(restoredComp.length, 1, '恢复后必须包含新增物料');
  console.log(`✔ 全量恢复成功: 恢复了 ${restoreRes.stats.components} 条元件记录`);

  // 最后再从最初快照回滚，保持数据库干净
  await db.rollbackFromSnapshot(snapshotResult.filename);
  const finalCheck = await db.searchComponents({ query: 'RESTORED_SPECIAL_CHIP' });
  assert.strictEqual(finalCheck.length, 0, '清理临时恢复物料完毕');

  // 删除测试快照文件
  try {
    fs.unlinkSync(snapshotResult.filePath);
    if (restoreRes.autoSnapshot) {
      const p = path.join(__dirname, '..', 'data', 'backups', restoreRes.autoSnapshot);
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }
  } catch (e) {}

  console.log('\n========================================================');
  console.log('🎉 备份、快照与数据安全恢复全部测试 100% 通过！');
  console.log('========================================================\n');
}

runTests().catch(err => {
  console.error('测试失败:', err);
  process.exit(1);
});
