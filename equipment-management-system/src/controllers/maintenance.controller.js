const service = require('../services/maintenance.service');
const { success } = require('../utils/response');
exports.create = async (req,res) => success(res, await service.create(req.body), 'Maintenance scheduled.', 201);
exports.list = async (req,res) => success(res, await service.list({ overdue:req.query.overdue === 'true' }));
exports.update = async (req,res) => success(res, await service.update(req.params.id,req.body), 'Maintenance updated.');
