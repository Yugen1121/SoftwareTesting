const db = require('../database/connection');
exports.summary = async () => {
  const [equipment, faults, maintenance, bookings] = await Promise.all([
    db.query(`SELECT COUNT(*)::int total,
      COUNT(*) FILTER(WHERE status='available')::int available,
      COUNT(*) FILTER(WHERE status='booked')::int booked,
      COUNT(*) FILTER(WHERE status='under_maintenance')::int under_maintenance,
      COUNT(*) FILTER(WHERE status='out_of_service')::int out_of_service FROM equipment`),
    db.query(`SELECT COUNT(*)::int outstanding FROM faults WHERE status IN ('open','in_progress')`),
    db.query(`SELECT COUNT(*)::int overdue FROM maintenance
      WHERE scheduled_at < NOW() AND status IN ('scheduled','in_progress')`),
    db.query(`SELECT COUNT(*)::int active FROM bookings WHERE status='confirmed' AND end_at > NOW()`)
  ]);
  return {
    equipment: equipment.rows[0],
    outstandingFaults: faults.rows[0].outstanding,
    overdueMaintenance: maintenance.rows[0].overdue,
    activeBookings: bookings.rows[0].active
  };
};
exports.maintenanceActivity = async () => {
  const { rows } = await db.query(
    `SELECT status,COUNT(*)::int AS count FROM maintenance GROUP BY status ORDER BY status`
  );
  return rows;
};
