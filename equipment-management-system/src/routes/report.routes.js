const router = require('express').Router();
const c = require('../controllers/report.controller');
const auth = require('../middleware/auth.middleware');
const roles = require('../middleware/role.middleware');
const asyncHandler = require('../utils/asyncHandler');
router.use(auth, roles('admin','manager'));
router.get('/summary', asyncHandler(c.summary));
router.get('/maintenance-activity', asyncHandler(c.maintenanceActivity));
module.exports = router;
