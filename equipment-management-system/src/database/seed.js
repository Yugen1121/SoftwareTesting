const bcrypt = require('bcrypt');
const { pool } = require('./connection');
const config = require('../config/config');

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const role of ['admin', 'manager', 'technician', 'user']) {
      await client.query('INSERT INTO roles(name) VALUES($1) ON CONFLICT(name) DO NOTHING', [role]);
    }
    const email = 'admin@example.com';
    const existing = await client.query('SELECT id FROM users WHERE email=$1', [email]);
    if (!existing.rowCount) {
      const hash = await bcrypt.hash('ChangeMe123!', config.bcryptRounds);
      const role = await client.query("SELECT id FROM roles WHERE name='admin'");
      await client.query(
        'INSERT INTO users(full_name,email,password_hash,role_id) VALUES($1,$2,$3,$4)',
        ['System Administrator', email, hash, role.rows[0].id]
      );
    }
    await client.query('COMMIT');
    console.log('Seed completed. Initial login: admin@example.com / ChangeMe123!');
    console.log('Change this password immediately outside development.');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
