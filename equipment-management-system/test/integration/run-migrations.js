const fs = require('fs');
const path = require('path');

async function runMigrations(pool) {
  const migrationsDirectory = path.resolve(
    __dirname,
    '../../src/database/migrations'
  );

  const files = fs.readdirSync(migrationsDirectory)
    .filter(file => file.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const sql = fs.readFileSync(
      path.join(migrationsDirectory, file),
      'utf8'
    );

    console.log(`Running migration: ${file}`);

    await pool.query(sql);
  }
}

module.exports = runMigrations;