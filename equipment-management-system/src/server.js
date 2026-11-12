const app = require('./app');
const config = require('./config/config');
const logger = require('./config/logger');
const { pool } = require('./database/connection');

const server = app.listen(config.port, () => {
  logger.info(`Equipment API listening on port ${config.port}`);
});

async function shutdown(signal) {
  logger.info(`${signal} received. Shutting down gracefully.`);
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
