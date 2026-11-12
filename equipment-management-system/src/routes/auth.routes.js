const router = require('express').Router();
const c = require('../controllers/auth.controller');
const validate = require('../middleware/validate.middleware');
const schemas = require('../validators/schemas');
const asyncHandler = require('../utils/asyncHandler');
router.post('/register', validate(schemas.register), asyncHandler(c.register));
router.post('/login', validate(schemas.login), asyncHandler(c.login));
module.exports = router;
