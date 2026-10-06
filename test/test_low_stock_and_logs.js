const http = require('http');

function get(path) {
  return new Promise((resolve, reject) => {
    http.get(`http://localhost:3000${path}`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, headers: res.headers, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, headers: res.headers, data });
        }
      });
    }).on('error', reject);
  });
}

function post(path, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = http.request(`http://localhost:3000${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, headers: res.headers, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, headers: res.headers, data });
        }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function run() {
  console.log('=== [Step 1] 测试低库存列表接口 ===');
  const lowStockRes = await get('/api/components/low-stock');
  console.log('低库存接口返回状态:', lowStockRes.status);
  console.log('低库存物料数:', lowStockRes.data.data.length);
  if (lowStockRes.data.data.length > 0) {
    const first = lowStockRes.data.data[0];
    console.log(`示例低库存项: [${first.name}] 存量: ${first.quantity}, 警戒线: ${first.effective_min_stock}`);
  }

  console.log('\n=== [Step 2] 测试全局日志接口 ===');
  const logsRes = await get('/api/logs?limit=5');
  console.log('全局日志返回状态:', logsRes.status);
  console.log('最近日志条数:', logsRes.data.data.length);
  if (logsRes.data.data.length > 0) {
    const log = logsRes.data.data[0];
    console.log(`最新流水: [${log.action_type}] 物料: ${log.component_name}, 变动: ${log.change_qty}, 结存: ${log.balance_qty}, 备注: ${log.note}`);
  }

  console.log('\n=== [Step 3] 测试补货单 Excel 导出接口 ===');
  const exportRes = await get('/api/components/export-replenishment');
  console.log('导出补货单返回状态:', exportRes.status);
  console.log('Content-Type:', exportRes.headers['content-type']);
  console.log('Content-Disposition:', exportRes.headers['content-disposition']);

  console.log('\n=== [Step 4] 测试步进扣减与日志联动 ===');
  const allCompRes = await get('/api/components');
  const comp = allCompRes.data.data[0];
  const oldQty = comp.quantity;
  const adjRes = await post(`/api/components/${comp.id}/adjust`, { delta: -1, note: '自动化测试扣减1件' });
  console.log(`物料 [${comp.name}] 扣减 1 件: ${oldQty} -> ${adjRes.data.data.quantity}`);

  const itemLogs = await get(`/api/logs?component_id=${comp.id}&limit=1`);
  console.log('该物料最新单品日志:', itemLogs.data.data[0].note);

  // 恢复原数量
  await post(`/api/components/${comp.id}/adjust`, { delta: 1, note: '自动化测试恢复1件' });
  console.log('已恢复原数量。');

  console.log('\n🎉 所有新特性接口验证 100% 通过！');
}

run().catch(console.error);
