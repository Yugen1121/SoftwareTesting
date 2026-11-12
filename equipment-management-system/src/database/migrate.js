const fs = require('fs');
const path = require('path');
const { pool } = require('./connection');

async function migrate() {
  const sql = fs.readFileSync(path.join(__dirname, 'migrations/001_initial.sql'), 'utf8');
  await pool.query(sql);
  console.log('Database migration completed.');
}

migrate().catch((error) => {
  console.error('Migration failed:', error);
  process.exitCode = 1;
}).finally(() => pool.end());
