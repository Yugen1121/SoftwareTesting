const Joi = require('joi');

const id = Joi.number().integer().positive();
exports.register = Joi.object({
  fullName: Joi.string().trim().min(2).max(120).required(),
  email: Joi.string().email().max(255).required(),
  password: Joi.string().min(10).max(72).required()
});
exports.login = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required()
});
exports.equipmentCreate = Joi.object({
  equipmentCode: Joi.string().trim().max(60).required(),
  name: Joi.string().trim().max(160).required(),
  description: Joi.string().allow('', null),
  category: Joi.string().max(100).allow('', null),
  location: Joi.string().trim().max(160).required()
});
exports.equipmentUpdate = exports.equipmentCreate.fork(
  ['equipmentCode', 'name', 'location'], (s) => s.optional()
).min(1);
exports.bookingCreate = Joi.object({
  equipmentId: id.required(),
  startAt: Joi.date().iso().required(),
  endAt: Joi.date().iso().greater(Joi.ref('startAt')).required(),
  purpose: Joi.string().max(1000).allow('', null)
});
exports.bookingUpdate = Joi.object({
  startAt: Joi.date().iso(),
  endAt: Joi.date().iso(),
  purpose: Joi.string().max(1000).allow('', null)
}).min(1);
exports.faultCreate = Joi.object({
  equipmentId: id.required(),
  description: Joi.string().trim().min(5).required(),
  severity: Joi.string().valid('low','medium','high','critical').default('medium')
});
exports.faultUpdate = Joi.object({
  assignedTo: id.allow(null),
  status: Joi.string().valid('open','in_progress','resolved','closed'),
  severity: Joi.string().valid('low','medium','high','critical'),
  description: Joi.string().min(5)
}).min(1);
exports.maintenanceCreate = Joi.object({
  equipmentId: id.required(),
  technicianId: id.allow(null),
  maintenanceType: Joi.string().max(100).required(),
  description: Joi.string().allow('', null),
  scheduledAt: Joi.date().iso().required()
});
exports.maintenanceUpdate = Joi.object({
  technicianId: id.allow(null),
  maintenanceType: Joi.string().max(100),
  description: Joi.string().allow('', null),
  scheduledAt: Joi.date().iso(),
  status: Joi.string().valid('scheduled','in_progress','completed','cancelled')
}).min(1);
exports.statusUpdate = Joi.object({
  status: Joi.string().valid('available','booked','under_maintenance','out_of_service').required(),
  reason: Joi.string().max(500).allow('', null)
});
