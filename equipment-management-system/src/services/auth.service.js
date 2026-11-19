const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const config = require('../config/config');
const users = require('../repositories/user.repository');
const ApiError = require('../utils/ApiError');

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const strongPasswordRegex =
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#^()_+\-={}[\]:;"'<>,./\\|~`]).{8,}$/;

exports.register = async ({ fullName, email, password, role = 'user' }) => {

  if (typeof fullName !== 'string' || fullName.trim().length < 5) {
    throw new ApiError(400, 'Full name must be at least 5 characters long.');
  }
  if (typeof email !== 'string' || !emailRegex.test(email)) {
    throw new ApiError(400, 'Please provide a valid email address.');
  }

  if (typeof password !== 'string' || !strongPasswordRegex.test(password)) {
    throw new ApiError(
      400,
      'Password must be at least 8 characters and contain uppercase, lowercase, number, and special character.'
    );
  }

  if (await users.findByEmail(email)) {
    throw new ApiError(409, 'Email is already registered.');
  }


  const hashedPassword = await bcrypt.hash(password, config.bcryptRounds);

  return users.create({
    fullName: fullName.trim(),
    email: email.trim().toLowerCase(),
    passwordHash: hashedPassword,
    role
  });
};


exports.login = async ({ email, password }) => {

  

  if (typeof email !== 'string' || !emailRegex.test(email)) {
    throw new ApiError(400, 'Please provide a valid email address.');
  }

  

  if (typeof password !== 'string' || !strongPasswordRegex.test(password)) {
    throw new ApiError(
      400,
      'Password must be at least 8 characters and contain uppercase, lowercase, number, and special character.'
    );
  }

  const user = await users.findByEmail(email.trim().toLowerCase());
  console.log("results within login: ", user)
  if (
    !user ||
    !user.is_active ||
    !(await bcrypt.compare(password, user.password_hash))
  ) {
    throw new ApiError(401, 'Invalid email or password.');
  }

  const token = jwt.sign(
    { sub: String(user.id), role: user.role },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn }
  );

  return {
    token,
    tokenType: 'Bearer',
    expiresIn: config.jwtExpiresIn,
    user: {
      id: user.id,
      fullName: user.full_name,
      email: user.email,
      role: user.role
    }
  };
};
