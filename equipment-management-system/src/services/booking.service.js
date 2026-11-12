const repo = require('../repositories/booking.repository');
const equipmentRepo = require('../repositories/equipment.repository');
const db = require('../database/connection');
const ApiError = require('../utils/ApiError');

exports.create = async (data, user) => db.withTransaction(async (client) => {
  const equipment = await equipmentRepo.findById(data.equipmentId, client, true);
  if (!equipment) throw new ApiError(404, 'Equipment not found.');
  if (equipment.status !== 'available') throw new ApiError(409, 'Equipment is not currently available.');
  const { rows } = await client.query(
    `SELECT id FROM bookings WHERE equipment_id=$1 AND status='confirmed'
     AND tstzrange(start_at,end_at,'[)') && tstzrange($2,$3,'[)') LIMIT 1`,
    [data.equipmentId,data.startAt,data.endAt]
  );
  if (rows.length) throw new ApiError(409, 'Equipment is already booked during that period.');
  const booking = await repo.create({ ...data, userId: user.id }, client);
  // The equipment status represents current operational state; future reservations do not mark it booked.
  if (new Date(data.startAt) <= new Date() && new Date(data.endAt) > new Date()) {
    await equipmentRepo.updateStatus(equipment.id, 'booked', client);
  }
  return booking;
});
exports.list = (filters) => repo.list(filters);
exports.update = async (id, data, user) => db.withTransaction(async (client) => {
  const booking = await repo.findById(id, client, true);
  if (!booking) throw new ApiError(404, 'Booking not found.');
  if (user.role === 'user' && Number(booking.user_id) !== Number(user.id)) throw new ApiError(403, 'You can only modify your own bookings.');
  if (booking.status !== 'confirmed') throw new ApiError(409, 'Only confirmed bookings can be changed.');
  const next = { ...data };
  const start = next.startAt || booking.start_at;
  const end = next.endAt || booking.end_at;
  if (new Date(end) <= new Date(start)) throw new ApiError(400, 'Booking end must be after start.');
  const { rows } = await client.query(
    `SELECT id FROM bookings WHERE equipment_id=$1 AND id<>$2 AND status='confirmed'
     AND tstzrange(start_at,end_at,'[)') && tstzrange($3,$4,'[)') LIMIT 1`,
    [booking.equipment_id,id,start,end]
  );
  if (rows.length) throw new ApiError(409, 'Updated booking conflicts with another reservation.');
  return repo.update(id, next, client);
});
exports.cancel = async (id, user) => {
  const booking = await repo.findById(id);
  if (!booking) throw new ApiError(404, 'Booking not found.');
  if (user.role === 'user' && Number(booking.user_id) !== Number(user.id)) throw new ApiError(403, 'You can only cancel your own bookings.');
  if (booking.status !== 'confirmed') throw new ApiError(409, 'Booking is not active.');
  const cancelled = await repo.update(id, { status: 'cancelled' });
  if (new Date(booking.start_at) <= new Date() && new Date(booking.end_at) > new Date()) {
    await db.withTransaction(async (client) => {
      const item = await equipmentRepo.findById(booking.equipment_id, client, true);
      if (item && item.status === 'booked') {
        await equipmentRepo.updateStatus(item.id, 'available', client);
        await client.query(
          `INSERT INTO equipment_status_history(equipment_id,old_status,new_status,changed_by,reason)
           VALUES($1,'booked','available',$2,'Booking cancelled')`,
          [item.id, user.id]
        );
      }
    });
  }
  return cancelled;
};
