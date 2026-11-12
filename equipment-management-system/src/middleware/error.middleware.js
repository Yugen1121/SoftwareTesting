const logger = require('../config/logger');
const config = require('../config/config');

module.exports = (error, req, res, next) => {
  let status = error.statusCode || 500;
  let message = error.message || 'Internal server error';

  if (error.code === '23P01') {
    status = 409;
    message = 'This equipment is already booked for part or all of that time range.';
  } else if (error.code === '23505') {
    status = 409;
    message = 'A record with that unique value already exists.';
  } else if (error.code === '23503') {
    status = 400;
    message = 'The request references a record that does not exist.';
  } else if (error.code === '23514' || error.code === '22P02') {
    status = 400;
    message = 'The supplied data is invalid.';
  }

  logger.error(message, { status, path: req.originalUrl, stack: error.stack });
  res.status(status).json({
    success: false,
    message,
    ...(error.details ? { details: error.details } : {}),
    ...(config.env === 'development' && status === 500 ? { stack: error.stack } : {})
  });
};
