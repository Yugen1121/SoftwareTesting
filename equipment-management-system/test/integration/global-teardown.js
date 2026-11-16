
const fs = require('fs');
const path = require('path');

module.exports = async () => {
  try {
    const container = globalThis.__POSTGRES_CONTAINER__;

    if (container) {
      console.log('Stopping PostgreSQL test container...');
      await container.stop();
    }
  } finally {
    const configFile = path.join(
      __dirname,
      '.test-database.json'
    );

    if (fs.existsSync(configFile)) {
      fs.unlinkSync(configFile);
    }

    console.log('PostgreSQL test container stopped.');
  }
};
