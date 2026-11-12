module.exports = (row) => row ? Object.freeze({ id: row.id, equipment_id: row.equipment_id, user_id: row.user_id, start_at: row.start_at, end_at: row.end_at, status: row.status }) : null;
