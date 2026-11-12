const repo = require('../repositories/fault.repository');
const equipment = require('../repositories/equipment.repository');
const ApiError = require('../utils/ApiError');

exports.create = async (data, user) => {
  if (!(await equipment.findById(data.equipmentId))) throw new ApiError(404, 'Equipment not found.');
  return repo.create({ ...data, reportedBy: user.id });
};
exports.list = (status) => repo.list(status);
exports.update = async (id, data) => {
  if (!(await repo.findById(id))) throw new ApiError(404, 'Fault report not found.');
  return repo.update(id, data);
};
