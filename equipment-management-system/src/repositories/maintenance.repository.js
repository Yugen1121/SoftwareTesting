const db = require('../database/connection');
exports.create = async (d, client = db) => {
  const { rows } = await client.query(
    `INSERT INTO maintenance(equipment_id,technician_id,maintenance_type,description,scheduled_at)
     VALUES($1,$2,$3,$4,$5) RETURNING *`,
    [d.equipmentId,d.technicianId || null,d.maintenanceType,d.description || null,d.scheduledAt]
  );
  return rows[0];
};
exports.findById = async (id) => {
  const { rows } = await db.query('SELECT * FROM maintenance WHERE id=$1',[id]);
  return rows[0] || null;
};
exports.list = async ({ overdue = false } = {}) => {
  const { rows } = await db.query(
    `SELECT m.*,e.equipment_code,e.name AS equipment_name,u.full_name AS technician_name
     FROM maintenance m JOIN equipment e ON e.id=m.equipment_id
     LEFT JOIN users u ON u.id=m.technician_id
     WHERE ($1::boolean = false OR (m.scheduled_at < NOW() AND m.status IN ('scheduled','in_progress')))
     ORDER BY m.scheduled_at`, [overdue]
  );
  return rows;
};
exports.update = async (id, d) => {
  const map = { technicianId:'technician_id', maintenanceType:'maintenance_type', description:'description', scheduledAt:'scheduled_at', status:'status' };
  const keys = Object.keys(d).filter(k => map[k]);
  const vals = keys.map(k => d[k]);
  const sets = keys.map((k,i) => `${map[k]}=$${i+1}`);
  if (d.status === 'completed') { vals.push(new Date()); sets.push(`completed_at=$${vals.length}`); }
  vals.push(id);
  const { rows } = await db.query(`UPDATE maintenance SET ${sets.join(',')} WHERE id=$${vals.length} RETURNING *`, vals);
  return rows[0] || null;
};
