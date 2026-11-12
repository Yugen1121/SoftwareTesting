const ApiError = require('../utils/ApiError');

module.exports = (schema, property = 'body') => (req, res, next) => {
  const { error, value } = schema.validate(req[property], {
    abortEarly: false, stripUnknown: true, convert: true
  });
  if (error) {
    return next(new ApiError(400, 'Validation failed.', error.details.map((d) => d.message)));
  }
  req[property] = value;
  next();
};
