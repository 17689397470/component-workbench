/**
 * 淘宝批量导入进阶功能自动化测试:
 * 1. 订单防重复导入 (already_imported 标记)
 * 2. 导入批次管理与整批撤销回滚 (rollback)
 * 3. 智能黑白名单与自定义规则配置 (rules)
 */

const assert = require('assert');

async function runTest() {
  console.log('=== [Step 0] 清理回滚遗留活跃批次，确保初始状态干净 ===');
  const initBatchesRes = await fetch('http://localhost:3000/api/taobao/batches');
  const initBatchesData = await initBatchesRes.json();
  for (const b of (initBatchesData.data || [])) {
    if (b.status === 'active') {
      await fetch(`http://localhost:3000/api/taobao/batches/${b.id}/rollback`, { method: 'POST' });
    }
  }

  console.log('\n=== [Step 1] 首次预览订单，应识别为尚未导入 ===');
  const res1 = await fetch('http://localhost:3000/api/taobao/preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ loadDefault: true })
  });
  const data1 = await res1.json();
  assert.strictEqual(data1.success, true);
  assert.ok(data1.count > 0);
  assert.strictEqual(data1.data[0].already_imported, false, '首测导入前 already_imported 应为 false');
  console.log(`✔ 首次解析成功，共 ${data1.count} 项，首项订单号: ${data1.data[0].order_id}，未入库状态正确`);

  console.log('\n=== [Step 2] 执行测试批次入库 (截取前 2 项入库) ===');
  const testItems = data1.data.slice(0, 2).map(it => ({
    ...it,
    quantity: 10,
    location: '测试收纳盒A'
  }));

  const resConfirm = await fetch('http://localhost:3000/api/taobao/confirm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      items: testItems,
      defaultLocation: '测试收纳盒A',
      filename: '自动化测试订单.xlsx'
    })
  });
  const confirmData = await resConfirm.json();
  assert.strictEqual(confirmData.success, true);
  const batchId = confirmData.summary.batchId;
  assert.ok(batchId, '应成功生成批次号');
  console.log(`✔ 入库成功，生成批次号: ${batchId}，录入 ${confirmData.summary.total} 项，总件数: ${confirmData.summary.totalPieces}`);

  console.log('\n=== [Step 3] 再次预览订单，应精准触发防重检测 (already_imported = true) ===');
  const res2 = await fetch('http://localhost:3000/api/taobao/preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ loadDefault: true })
  });
  const data2 = await res2.json();
  assert.strictEqual(data2.success, true);
  // 前两项共享同一个订单号 3033732793320546872
  const dupItem = data2.data.find(it => it.order_id === testItems[0].order_id);
  assert.ok(dupItem);
  assert.strictEqual(dupItem.already_imported, true, '已入库订单应触发 already_imported = true');
  assert.strictEqual(dupItem.imported_batch_id, batchId, '应匹配到对应的批次号');
  console.log(`✔ 防重检测生效: 订单号 [${dupItem.order_id}] 成功命中已导入批次 [${dupItem.imported_batch_id}]`);

  console.log('\n=== [Step 4] 查询批次历史列表 ===');
  const resBatches = await fetch('http://localhost:3000/api/taobao/batches');
  const batchData = await resBatches.json();
  assert.strictEqual(batchData.success, true);
  const foundBatch = batchData.data.find(b => b.id === batchId);
  assert.ok(foundBatch);
  assert.strictEqual(foundBatch.status, 'active');
  console.log(`✔ 批次历史查询成功，找到当前活跃批次 [${foundBatch.id}], 文件: ${foundBatch.filename}`);

  console.log('\n=== [Step 5] 执行一键撤销回滚 (Rollback) ===');
  const resRollback = await fetch(`http://localhost:3000/api/taobao/batches/${batchId}/rollback`, {
    method: 'POST'
  });
  const rollbackData = await resRollback.json();
  assert.strictEqual(rollbackData.success, true);
  assert.strictEqual(rollbackData.data.batchId, batchId);
  assert.strictEqual(rollbackData.data.status, 'rolled_back');
  console.log(`✔ 批次一键回滚成功: 撤回 ${rollbackData.data.revertedCount} 项，扣回件数: ${rollbackData.data.totalPiecesReverted}`);

  console.log('\n=== [Step 6] 回滚后再次预览，防重状态应恢复为未入库 (already_imported = false) ===');
  const res3 = await fetch('http://localhost:3000/api/taobao/preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ loadDefault: true })
  });
  const data3 = await res3.json();
  const rolledBackItem = data3.data.find(it => it.order_id === testItems[0].order_id);
  assert.strictEqual(rolledBackItem.already_imported, false, '回滚后 order_id 防重状态应恢复为 false');
  console.log(`✔ 恢复校验通过: 撤销批次后，该订单号重新标记为可入库状态`);

  console.log('\n=== [Step 7] 测试自定义规则增删查与重置 ===');
  const getRulesRes = await fetch('http://localhost:3000/api/taobao/rules');
  const rulesData = await getRulesRes.json();
  assert.strictEqual(rulesData.success, true);

  const updatedRulesRes = await fetch('http://localhost:3000/api/taobao/rules', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ignoreKeywords: [...rulesData.data.ignoreKeywords, '测试特殊忽略词123'],
      cleanGarbageWords: rulesData.data.cleanGarbageWords,
      categoryDefaultLocations: rulesData.data.categoryDefaultLocations
    })
  });
  const updatedData = await updatedRulesRes.json();
  assert.ok(updatedData.data.ignoreKeywords.includes('测试特殊忽略词123'));
  console.log('✔ 自定义规则保存生效');

  const resetRulesRes = await fetch('http://localhost:3000/api/taobao/rules/reset', { method: 'POST' });
  const resetData = await resetRulesRes.json();
  assert.strictEqual(resetData.data.ignoreKeywords.includes('测试特殊忽略词123'), false);
  console.log('✔ 自定义规则重置默认值生效');

  console.log('\n======================================================');
  console.log('🎉 订单防重、批次撤销回滚与自定义规则三大核心功能 100% 验证通过！');
  console.log('======================================================');
}

runTest().catch(err => {
  console.error('测试失败:', err);
  process.exit(1);
});
