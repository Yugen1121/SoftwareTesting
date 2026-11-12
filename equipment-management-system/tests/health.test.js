process.env.JWT_SECRET = 'test_secret_that_is_long_enough_for_jwt_signing';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.NODE_ENV = 'test';

const request = require('supertest');
const app = require('../src/app');

describe('Health endpoint', () => {
  test('returns healthy status', async () => {
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('healthy');
  });

  test('returns JSON 404 for unknown routes', async () => {
    const response = await request(app).get('/not-a-route');
    expect(response.status).toBe(404);
    expect(response.body.success).toBe(false);
  });
});
