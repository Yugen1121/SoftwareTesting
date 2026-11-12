const router = require('express').Router();
const c = require('../controllers/user.controller');
const auth = require('../middleware/auth.middleware');
const roles = require('../middleware/role.middleware');
const asyncHandler = require('../utils/asyncHandler');
router.get('/', auth, roles('admin','manager'), asyncHandler(c.list));
module.exports = router;
