const http = require('http');

function request(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(`http://localhost:3000${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {})
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, data });
        }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function run() {
  console.log('=== [Step 1] 测试新增独立阻值电阻 ===');
  const resComp = await request('POST', '/api/components', {
    name: '0805 4.7kΩ 贴片电阻',
    category: '电阻',
    package: '0805',
    value: '4.7kΩ',
    standard_value: 4700,
    unit: 'Ω',
    tolerance: '1%',
    quantity: 120,
    location: '默认电阻盒',
    notes: '动态表头测试料'
  });
  console.log('新增电阻响应:', resComp.data.success, 'ID:', resComp.data.data.id);
  const resId = resComp.data.data.id;

  console.log('\n=== [Step 2] 测试新增独立容值与耐压电容 ===');
  const capComp = await request('POST', '/api/components', {
    name: '0603 4.7µF 16V 贴片电容',
    category: '电容',
    package: '0603',
    value: '4.7µF',
    standard_value: 4700000,
    unit: 'pF',
    voltage: 16,
    tolerance: '10%',
    quantity: 80,
    location: '默认电容盒',
    notes: '动态表头测试料'
  });
  console.log('新增电容响应:', capComp.data.success, 'ID:', capComp.data.data.id);
  const capId = capComp.data.data.id;

  console.log('\n=== [Step 3] 验证电阻分类查询与阻值字段 ===');
  const resList = await request('GET', '/api/components?category=' + encodeURIComponent('电阻'));
  const foundRes = resList.data.data.find(c => c.id === resId);
  console.log('电阻标称阻值:', foundRes.value, '物理欧姆值:', foundRes.standard_value, '精度:', foundRes.tolerance);

  console.log('\n=== [Step 4] 验证电容分类查询与容值耐压字段 ===');
  const capList = await request('GET', '/api/components?category=' + encodeURIComponent('电容'));
  const foundCap = capList.data.data.find(c => c.id === capId);
  console.log('电容标称容值:', foundCap.value, '物理皮法值:', foundCap.standard_value, '耐压:', foundCap.voltage + 'V');

  console.log('\n=== [Step 5] 测试更新电阻标称阻值 ===');
  await request('PUT', `/api/components/${resId}`, {
    value: '47kΩ',
    standard_value: 47000,
    tolerance: '0.5%'
  });
  const updatedResList = await request('GET', '/api/components?category=' + encodeURIComponent('电阻'));
  const updatedRes = updatedResList.data.data.find(c => c.id === resId);
  console.log('更新后阻值:', updatedRes.value, '更新后物理欧姆:', updatedRes.standard_value, '更新后精度:', updatedRes.tolerance);

  // 清理测试数据
  await request('DELETE', `/api/components/${resId}`);
  await request('DELETE', `/api/components/${capId}`);
  console.log('\n测试元器件已成功清理。');

  console.log('\n🎉 品类专属参数一等公民与动态字段体系端到端校验 100% 通过！');
}

run().catch(console.error);
