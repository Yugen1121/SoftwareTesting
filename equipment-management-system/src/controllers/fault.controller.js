const service = require('../services/fault.service');
const { success } = require('../utils/response');
exports.create = async (req,res) => success(res, await service.create(req.body,req.user), 'Fault reported.', 201);
exports.list = async (req,res) => success(res, await service.list(req.query.status));
exports.update = async (req,res) => success(res, await service.update(req.params.id,req.body), 'Fault updated.');
