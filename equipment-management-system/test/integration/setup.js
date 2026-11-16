
const fs = require('fs');
const path = require('path');

const configFile = path.join(
  __dirname,
  '.test-database.json'
);

const { connectionUri } = JSON.parse(
  fs.readFileSync(configFile, 'utf8')
);

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = connectionUri;

process.env.JWT_SECRET =
  '12345678912345678912345678912345';
