const repo = require('../repositories/maintenance.repository');
const equipmentRepo = require('../repositories/equipment.repository');
const db = require('../database/connection');
const ApiError = require('../utils/ApiError');

exports.create = async (data) => db.withTransaction(async (client) => {
  const item = await equipmentRepo.findById(data.equipmentId, client, true);
  if (!item) throw new ApiError(404, 'Equipment not found.');
  const maintenance = await repo.create(data, client);
  await equipmentRepo.updateStatus(item.id, 'under_maintenance', client);
  await client.query(
    `INSERT INTO equipment_status_history(equipment_id,old_status,new_status,reason)
     VALUES($1,$2,'under_maintenance','Maintenance scheduled')`, [item.id,item.status]
  );
  return maintenance;
});
exports.list = (filters) => repo.list(filters);
exports.update = async (id, data) => {
  const existing = await repo.findById(id);
  if (!existing) throw new ApiError(404, 'Maintenance record not found.');
  const updated = await repo.update(id, data);
  if (data.status === 'completed') {
    await db.withTransaction(async (client) => {
      const item = await equipmentRepo.findById(existing.equipment_id, client, true);
      if (item && item.status === 'under_maintenance') {
        await equipmentRepo.updateStatus(item.id, 'available', client);
        await client.query(
          `INSERT INTO equipment_status_history(equipment_id,old_status,new_status,reason)
           VALUES($1,'under_maintenance','available','Maintenance completed')`, [item.id]
        );
      }
    });
  }
  return updated;
};
