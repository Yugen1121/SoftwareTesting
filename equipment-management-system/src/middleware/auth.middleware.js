const jwt = require('jsonwebtoken');
const config = require('../config/config');
const ApiError = require('../utils/ApiError');
const userRepository = require('../repositories/user.repository');

module.exports = async (req, res, next) => {
  try {
    const header = req.headers.authorization || '';
    if (!header.startsWith('Bearer ')) throw new ApiError(401, 'Authentication token required.');
    let payload;
    try {
      payload = jwt.verify(header.slice(7), config.jwtSecret);
    } catch {
      throw new ApiError(401, 'Invalid or expired authentication token.');
    }
    const user = await userRepository.findById(payload.sub);
    if (!user || !user.is_active) throw new ApiError(401, 'User account is unavailable.');
    req.user = { id: user.id, email: user.email, fullName: user.full_name, role: user.role };
    next();
  } catch (error) {
    next(error);
  }
};
