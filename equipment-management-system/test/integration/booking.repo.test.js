const db = require('../../src/database/connection');
const usersRepo = require("../../src/repositories/user.repository")
const equipmentsRepo= require("../../src/repositories/equipment.repository")
const usersData = require('./helpers/models/users')
const equipmentsData = require('./helpers/models/equipments')
const bookingRepository = require(
  '../../src/repositories/booking.repository'
);

describe('Booking Repository Integration Tests', () => {
  let client;

  beforeEach(async () => {
    client = await db.pool.connect();
    await client.query('BEGIN');
  });

  afterEach(async () => {
    try {
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  });

  afterAll(async () => {
    await db.pool.end();
  });

  it('should create a booking', async () => {

    // Insert prerequisite user and equipment records here,
    // using your actual database schema.

    const user = await usersRepo.create(usersData.user1, client);
    const equipment = await equipmentsRepo.create(equipmentsData.equipment1, client);
    const equipmentId = equipment.id;
    const userId = user.id;
    
    const booking = await bookingRepository.create({
      equipmentId,
      userId,
      startAt: '2026-11-20T10:00:00Z',
      endAt: '2026-11-20T12:00:00Z',
      purpose: 'Integration testing'
    }, client);

    expect(booking).toBeDefined();
    expect(booking.equipment_id).toBe(equipmentId);
    expect(booking.user_id).toBe(userId);
    expect(booking.purpose).toBe('Integration testing');
  });
});