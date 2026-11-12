const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const config = require('../config/config');
const users = require('../repositories/user.repository');
const ApiError = require('../utils/ApiError');

exports.register = async (data) => {
  if (await users.findByEmail(data.email)) throw new ApiError(409, 'Email is already registered.');
  const passwordHash = await bcrypt.hash(data.password, config.bcryptRounds);
  return users.create({ ...data, passwordHash });
};
exports.login = async ({ email, password }) => {
  const user = await users.findByEmail(email);
  if (!user || !user.is_active || !(await bcrypt.compare(password, user.password_hash))) {
    throw new ApiError(401, 'Invalid email or password.');
  }
  const token = jwt.sign({ sub: String(user.id), role: user.role }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
  return {
    token,
    tokenType: 'Bearer',
    expiresIn: config.jwtExpiresIn,
    user: { id: user.id, fullName: user.full_name, email: user.email, role: user.role }
  };
};
