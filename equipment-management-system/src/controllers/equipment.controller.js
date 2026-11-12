const service = require('../services/equipment.service');
const { success } = require('../utils/response');
const { getPagination } = require('../utils/pagination');
exports.create = async (req,res) => success(res, await service.create(req.body), 'Equipment created.', 201);
exports.list = async (req,res) => {
  const page = getPagination(req.query);
  const result = await service.list({ ...page, search:req.query.search, status:req.query.status, location:req.query.location, category:req.query.category });
  success(res, { ...result, page:page.page, limit:page.limit });
};
exports.get = async (req,res) => success(res, await service.get(req.params.id));
exports.update = async (req,res) => success(res, await service.update(req.params.id,req.body), 'Equipment updated.');
exports.remove = async (req,res) => success(res, await service.remove(req.params.id), 'Equipment deleted.');
exports.status = async (req,res) => success(res, await service.setStatus(req.params.id,req.body.status,req.user.id,req.body.reason), 'Equipment status updated.');
exports.availability = async (req,res) => success(res, await service.availability());
