/**
 * 扫码与 OCR 标签智能解析接口单元测试 (test/test_scan_resolve.js)
 */

const assert = require('assert');

async function testScanResolve() {
  console.log('--- [Step 1] 测试立创标准物料二维码解析 (C2057) ---');
  const res1 = await fetch('http://localhost:3000/api/scan/resolve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rawText: 'C2057 QTY:100', scanType: 'qrcode' })
  });
  const data1 = await res1.json();
  assert.strictEqual(data1.success, true);
  assert.strictEqual(data1.data.lcsc_part, 'C2057');
  assert.strictEqual(data1.data.category, '电容');
  assert.strictEqual(data1.data.quantity, 100);
  console.log(`✔ C2057 解析成功: 品名=${data1.data.name}, 分类=${data1.data.category}, 目标盒子=${data1.targetLocation}`);

  console.log('\n--- [Step 2] 测试立创 JSON 复合二维码解析 ---');
  const res2 = await fetch('http://localhost:3000/api/scan/resolve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rawText: '{"pc":"C14663","qty":50}', scanType: 'qrcode' })
  });
  const data2 = await res2.json();
  assert.strictEqual(data2.success, true);
  assert.strictEqual(data2.data.lcsc_part, 'C14663');
  assert.strictEqual(data2.data.quantity, 50);
  console.log(`✔ JSON 二维码解析成功: C编号=${data2.data.lcsc_part}, 数量=${data2.data.quantity}`);

  console.log('\n--- [Step 3] 测试无二维码的 OCR 贴片电阻标签文字解析 ---');
  const res3 = await fetch('http://localhost:3000/api/scan/resolve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rawText: '贴片厚膜电阻 0805 10K 1% 100只 厚声 全新原装', scanType: 'ocr' })
  });
  const data3 = await res3.json();
  assert.strictEqual(data3.success, true);
  assert.strictEqual(data3.data.category, '电阻');
  assert.strictEqual(data3.data.package, '0805');
  console.log(`✔ OCR 电阻标签解析成功: 阻值=${data3.data.value}, 封装=${data3.data.package}, 分类=${data3.data.category}`);

  console.log('\n--- [Step 4] 测试无二维码的 OCR 芯片稳压管标签文字解析 ---');
  const res4 = await fetch('http://localhost:3000/api/scan/resolve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rawText: 'AMS1117-3.3 稳压芯片 SOT-223 50片', scanType: 'ocr' })
  });
  const data4 = await res4.json();
  assert.strictEqual(data4.success, true);
  assert.strictEqual(data4.data.category, '芯片');
  assert.strictEqual(data4.data.package, 'SOT-223');
  console.log(`✔ OCR 芯片标签解析成功: 型号=${data4.data.name}, 封装=${data4.data.package}, 分类=${data4.data.category}`);

  console.log('\n========================================================');
  console.log('🎉 扫码与 OCR 标签智能解析全部测试 100% 通过！');
  console.log('========================================================\n');
}

testScanResolve().catch(err => {
  console.error('❌ 测试失败:', err);
  process.exit(1);
});
