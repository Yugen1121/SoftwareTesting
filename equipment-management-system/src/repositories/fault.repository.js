const db = require('../database/connection');
exports.create = async (d) => {
  const { rows } = await db.query(
    `INSERT INTO faults(equipment_id,reported_by,description,severity)
     VALUES($1,$2,$3,$4) RETURNING *`, [d.equipmentId,d.reportedBy,d.description,d.severity]
  );
  return rows[0];
};
exports.findById = async (id) => {
  const { rows } = await db.query('SELECT * FROM faults WHERE id=$1',[id]);
  return rows[0] || null;
};
exports.list = async (status) => {
  const { rows } = await db.query(
    `SELECT f.*,e.equipment_code,e.name AS equipment_name,u.full_name AS reporter
     FROM faults f JOIN equipment e ON e.id=f.equipment_id
     JOIN users u ON u.id=f.reported_by
     WHERE ($1::text IS NULL OR f.status=$1) ORDER BY f.reported_at DESC`, [status || null]
  );
  return rows;
};
exports.update = async (id, d) => {
  const map = { assignedTo:'assigned_to', status:'status', severity:'severity', description:'description' };
  const keys = Object.keys(d).filter(k => map[k]);
  const vals = keys.map(k => d[k]);
  const sets = keys.map((k,i) => `${map[k]}=$${i+1}`);
  if (d.status === 'resolved') { vals.push(new Date()); sets.push(`resolved_at=$${vals.length}`); }
  vals.push(id);
  const { rows } = await db.query(`UPDATE faults SET ${sets.join(',')} WHERE id=$${vals.length} RETURNING *`, vals);
  return rows[0] || null;
};
