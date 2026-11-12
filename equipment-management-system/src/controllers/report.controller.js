const service = require('../services/report.service');
const { success } = require('../utils/response');
exports.summary = async (req,res) => success(res, await service.summary());
exports.maintenanceActivity = async (req,res) => success(res, await service.maintenanceActivity());
