const db = require('../database/connection');

exports.create = async (data, client = db) => {
  const { rows } = await client.query(
    `INSERT INTO equipment(equipment_code,name,description,category,location)
     VALUES($1,$2,$3,$4,$5) RETURNING *`,
    [data.equipmentCode,data.name,data.description || null,data.category || null,data.location]
  );
  return rows[0];
};
exports.findById = async (id, client = db, lock = false) => {
  const { rows } = await client.query(`SELECT * FROM equipment WHERE id=$1 ${lock ? 'FOR UPDATE' : ''}`, [id]);
  return rows[0] || null;
};
exports.list = async ({ search, status, location, category, limit, offset }) => {
  const values = [];
  const clauses = [];
  const add = (sql, value) => { values.push(value); clauses.push(sql.replace('?', `$${values.length}`)); };
  if (search) add("(equipment_code ILIKE ? OR name ILIKE ? OR description ILIKE ?)", `%${search}%`);
  if (status) add("status = ?", status);
  if (location) add("location ILIKE ?", `%${location}%`);
  if (category) add("category ILIKE ?", `%${category}%`);
  // Search has three placeholders and is handled separately to keep parameter numbering correct.
  let where = '';
  const params = [];
  const conditions = [];
  if (search) {
    params.push(`%${search}%`);
    conditions.push(`(equipment_code ILIKE $${params.length} OR name ILIKE $${params.length} OR description ILIKE $${params.length})`);
  }
  for (const [field, value, op] of [['status',status,'='],['location',location,'ILIKE'],['category',category,'ILIKE']]) {
    if (value) {
      params.push(op === 'ILIKE' ? `%${value}%` : value);
      conditions.push(`${field} ${op} $${params.length}`);
    }
  }
  if (conditions.length) where = `WHERE ${conditions.join(' AND ')}`;
  const count = await db.query(`SELECT COUNT(*)::int AS total FROM equipment ${where}`, params);
  params.push(limit, offset);
  const result = await db.query(
    `SELECT * FROM equipment ${where} ORDER BY id DESC LIMIT $${params.length-1} OFFSET $${params.length}`, params
  );
  return { rows: result.rows, total: count.rows[0].total };
};
exports.update = async (id, data) => {
  const map = { equipmentCode:'equipment_code', name:'name', description:'description', category:'category', location:'location' };
  const fields = Object.keys(data).filter((key) => map[key]);
  if (!fields.length) return exports.findById(id);
  const values = fields.map((key) => data[key]);
  const sets = fields.map((key, i) => `${map[key]}=$${i+1}`);
  values.push(id);
  const { rows } = await db.query(
    `UPDATE equipment SET ${sets.join(',')}, updated_at=NOW() WHERE id=$${values.length} RETURNING *`, values
  );
  return rows[0] || null;
};
exports.updateStatus = async (id, status, client = db) => {
  const { rows } = await client.query(
    'UPDATE equipment SET status=$1,updated_at=NOW() WHERE id=$2 RETURNING *', [status,id]
  );
  return rows[0] || null;
};
exports.remove = async (id) => {
  const result = await db.query('DELETE FROM equipment WHERE id=$1 RETURNING id', [id]);
  return result.rowCount > 0;
};
exports.availability = async () => {
  const { rows } = await db.query(
    `SELECT status,COUNT(*)::int AS count FROM equipment GROUP BY status ORDER BY status`
  );
  return rows;
};
