const repo = require('../repositories/report.repository');
exports.summary = () => repo.summary();
exports.maintenanceActivity = () => repo.maintenanceActivity();
