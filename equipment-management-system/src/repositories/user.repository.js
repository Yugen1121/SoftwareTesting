const db = require('../database/connection');

exports.findByEmail = async (email) => {
  const { rows } = await db.query(
    `SELECT u.*, r.name AS role FROM users u JOIN roles r ON r.id=u.role_id WHERE u.email=$1`,
    [email]
  );
  return rows[0] || null;
};
exports.findById = async (id) => {
  const { rows } = await db.query(
    `SELECT u.id,u.full_name,u.email,u.is_active,u.role_id,r.name AS role
     FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id=$1`, [id]
  );
  return rows[0] || null;
};
exports.create = async ({ fullName, email, passwordHash, role = 'user' }) => {
  const { rows } = await db.query(
    `INSERT INTO users(full_name,email,password_hash,role_id)
     VALUES($1,$2,$3,(SELECT id FROM roles WHERE name=$4))
     RETURNING id,full_name,email,created_at`,
    [fullName,email,passwordHash,role]
  );
  return rows[0];
};
exports.list = async () => {
  const { rows } = await db.query(
    `SELECT u.id,u.full_name,u.email,u.is_active,r.name AS role,u.created_at
     FROM users u JOIN roles r ON r.id=u.role_id ORDER BY u.id`
  );
  return rows;
};
