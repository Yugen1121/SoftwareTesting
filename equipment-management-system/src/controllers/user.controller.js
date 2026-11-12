const repo = require('../repositories/user.repository');
const { success } = require('../utils/response');
exports.list = async (req,res) => success(res, await repo.list());
