const fs = require('fs');
const path = require('path');
const db = require('../lib/db');

const DATA_DIR = path.join(__dirname, '..', 'data');
const BACKUPS_DIR = path.join(DATA_DIR, 'backups');
const DB_PATH = path.join(DATA_DIR, 'components.db');

if (!fs.existsSync(BACKUPS_DIR)) {
  fs.mkdirSync(BACKUPS_DIR, { recursive: true });
}

// 1. 完整物理备份现存测试数据库
const backupFileName = `snapshot_before_clean_test_data_${Date.now()}.db`;
const backupFilePath = path.join(BACKUPS_DIR, backupFileName);
fs.copyFileSync(DB_PATH, backupFilePath);
console.log('✔ 已安全备份测试数据库到:', backupFilePath);

// 2. 清空假数据并重置自增 ID
db.initDb().then(async () => {
  const d = db.getDb();
  const tables = [
    'components',
    'projects',
    'project_items',
    'stock_logs',
    'import_batches',
    'storage_boxes',
    'substitute_rules'
  ];

  d.serialize(() => {
    tables.forEach((t) => {
      d.run(`DELETE FROM ${t};`, (err) => {
        if (err) console.error(`Delete ${t} failed:`, err);
        else console.log(`✔ 已清空数据表: ${t}`);
      });
    });

    // 重置 sqlite_sequence
    const tableNames = tables.map((t) => `'${t}'`).join(',');
    d.run(`DELETE FROM sqlite_sequence WHERE name IN (${tableNames});`, (err) => {
      if (err) console.warn('Reset sequence warn:', err?.message);
      else console.log('✔ 已重置自增 ID 计数器');
    });

    // 释放空间与压缩
    d.run('VACUUM;', (err) => {
      if (err) console.error('VACUUM failed:', err);
      else console.log('✔ 数据库已完成 VACUUM 空间释放与磁盘重整！');
      process.exit(0);
    });
  });
});
