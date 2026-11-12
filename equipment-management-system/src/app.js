const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const config = require('./config/config');
const errorHandler = require('./middleware/error.middleware');
const ApiError = require('./utils/ApiError');

const app = express();
app.disable('x-powered-by');
app.use(helmet());
app.use(cors({ origin: config.corsOrigin === '*' ? true : config.corsOrigin.split(',').map(v => v.trim()) }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, standardHeaders: 'draft-7', legacyHeaders: false }));

app.get('/health', (req,res) => res.json({ success:true, status:'healthy' }));
app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/users', require('./routes/user.routes'));
app.use('/api/equipment', require('./routes/equipment.routes'));
app.use('/api/bookings', require('./routes/booking.routes'));
app.use('/api/faults', require('./routes/fault.routes'));
app.use('/api/maintenance', require('./routes/maintenance.routes'));
app.use('/api/reports', require('./routes/report.routes'));

app.use((req,res,next) => next(new ApiError(404, `Route not found: ${req.method} ${req.originalUrl}`)));
app.use(errorHandler);
module.exports = app;
