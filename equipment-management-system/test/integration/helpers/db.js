const db = require('../../../src/database/connection');

let sequence = 0;
const unique = () => `${Date.now()}_${++sequence}`;

// Repositories that use the shared pool cannot be isolated with BEGIN/ROLLBACK so each test starts from empty tables instead. Roles are kept
exports.resetDatabase = () =>
  db.query(
    `TRUNCATE equipment_status_history, maintenance, faults, bookings, equipment, users
     RESTART IDENTITY CASCADE`
  );

exports.createUser = async ({ role = 'user', fullName = 'Test User', email } = {}) => {
  const { rows } = await db.query(
    `INSERT INTO users(full_name, email, password_hash, role_id)
     VALUES($1, $2, $3, (SELECT id FROM roles WHERE name = $4))
     RETURNING id, full_name, email, role_id`,
    [fullName, email || `user_${unique()}@test.local`, 'not-a-real-hash', role]
  );
  return rows[0];
};

exports.createEquipment = async ({
  code,
  name = 'Test Equipment',
  location = 'Lab 1',
  status = 'available'
} = {}) => {
  const { rows } = await db.query(
    `INSERT INTO equipment(equipment_code, name, location, status)
     VALUES($1, $2, $3, $4)
     RETURNING *`,
    [code || `EQ-${unique()}`, name, location, status]
  );
  return rows[0];
};

exports.hoursFromNow = (hours) => new Date(Date.now() + hours * 60 * 60 * 1000);
