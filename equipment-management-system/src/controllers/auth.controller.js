const service = require('../services/auth.service');
const { success } = require('../utils/response');
exports.register = async (req,res) => success(res, await service.register(req.body), 'User registered successfully.', 201);
exports.login = async (req,res) => success(res, await service.login(req.body), 'Login successful.');
