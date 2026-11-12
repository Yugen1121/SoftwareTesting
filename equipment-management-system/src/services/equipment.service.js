const repo = require('../repositories/equipment.repository');
const db = require('../database/connection');
const ApiError = require('../utils/ApiError');

exports.create = (data) => repo.create(data);
exports.list = (filters) => repo.list(filters);
exports.get = async (id) => {
  const item = await repo.findById(id);
  if (!item) throw new ApiError(404, 'Equipment not found.');
  return item;
};
exports.update = async (id, data) => {
  await exports.get(id);
  return repo.update(id, data);
};
exports.remove = async (id) => {
  await exports.get(id);
  const deleted = await repo.remove(id);
  if (!deleted) throw new ApiError(404, 'Equipment not found.');
  return { deleted: true };
};
exports.setStatus = async (id, status, userId, reason) => db.withTransaction(async (client) => {
  const item = await repo.findById(id, client, true);
  if (!item) throw new ApiError(404, 'Equipment not found.');
  const allowed = {
    available: ['booked','under_maintenance','out_of_service'],
    booked: ['available','under_maintenance','out_of_service'],
    under_maintenance: ['available','out_of_service'],
    out_of_service: ['available','under_maintenance']
  };
  if (item.status !== status && !allowed[item.status].includes(status)) {
    throw new ApiError(400, `Invalid status transition: ${item.status} -> ${status}.`);
  }
  if (item.status !== status) {
    await repo.updateStatus(id, status, client);
    await client.query(
      `INSERT INTO equipment_status_history(equipment_id,old_status,new_status,changed_by,reason)
       VALUES($1,$2,$3,$4,$5)`, [id,item.status,status,userId,reason || null]
    );
  }
  return repo.findById(id, client);
});
exports.availability = () => repo.availability();
