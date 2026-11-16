
const fs = require('fs');
const path = require('path');

const {
  PostgreSqlContainer
} = require('@testcontainers/postgresql');

const { Pool } = require('pg');

const runMigrations = require('./run-migrations');

module.exports = async () => {
  let container;
  let pool;

  try {
    console.log('Starting PostgreSQL test container...');

    container = await new PostgreSqlContainer('postgres:17-alpine')
      .withDatabase('bookings_test')
      .withUsername('test_user')
      .withPassword('test_password')
      .start();

    const connectionUri = container.getConnectionUri();

    console.log('PostgreSQL container started.');

    pool = new Pool({
      connectionString: connectionUri
    });

    await runMigrations(pool);

    console.log('Database migrations completed.');

    fs.writeFileSync(
      path.join(__dirname, '.test-database.json'),
      JSON.stringify({ connectionUri })
    );

    globalThis.__POSTGRES_CONTAINER__ = container;

  } catch (error) {
    await container?.stop();
    throw error;

  } finally {
    await pool?.end();
  }
};
