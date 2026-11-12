const service = require('../services/booking.service');
const { success } = require('../utils/response');
exports.create = async (req,res) => success(res, await service.create(req.body,req.user), 'Booking created.', 201);
exports.list = async (req,res) => success(res, await service.list({
  userId: req.user.role === 'user' ? req.user.id : req.query.userId,
  status:req.query.status
}));
exports.update = async (req,res) => success(res, await service.update(req.params.id,req.body,req.user), 'Booking updated.');
exports.cancel = async (req,res) => success(res, await service.cancel(req.params.id,req.user), 'Booking cancelled.');
