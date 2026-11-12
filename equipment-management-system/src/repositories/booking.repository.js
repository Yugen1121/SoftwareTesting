const db = require('../database/connection');

exports.create = async (data, client = db) => {
  const { rows } = await client.query(
    `INSERT INTO bookings(equipment_id,user_id,start_at,end_at,purpose)
     VALUES($1,$2,$3,$4,$5) RETURNING *`,
    [data.equipmentId,data.userId,data.startAt,data.endAt,data.purpose || null]
  );
  return rows[0];
};
exports.findById = async (id, client = db, lock = false) => {
  const { rows } = await client.query(`SELECT * FROM bookings WHERE id=$1 ${lock ? 'FOR UPDATE' : ''}`, [id]);
  return rows[0] || null;
};
exports.list = async ({ userId, status }) => {
  const values = [];
  const clauses = [];
  if (userId) { values.push(userId); clauses.push(`b.user_id=$${values.length}`); }
  if (status) { values.push(status); clauses.push(`b.status=$${values.length}`); }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const { rows } = await db.query(
    `SELECT b.*,e.equipment_code,e.name AS equipment_name,u.full_name AS booked_by
     FROM bookings b JOIN equipment e ON e.id=b.equipment_id
     JOIN users u ON u.id=b.user_id ${where} ORDER BY b.start_at DESC`, values
  );
  return rows;
};
exports.update = async (id, data, client = db) => {
  const map = { startAt:'start_at', endAt:'end_at', purpose:'purpose', status:'status' };
  const keys = Object.keys(data).filter(k => map[k]);
  if (!keys.length) return exports.findById(id, client);
  const vals = keys.map(k => data[k]);
  const sets = keys.map((k,i) => `${map[k]}=$${i+1}`);
  vals.push(id);
  const { rows } = await client.query(
    `UPDATE bookings SET ${sets.join(',')} WHERE id=$${vals.length} RETURNING *`, vals
  );
  return rows[0] || null;
};
