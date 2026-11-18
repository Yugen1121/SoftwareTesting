const db = require('../../src/database/connection');
const usersRepo = require('../../src/repositories/user.repository');
const equipmentsRepo = require('../../src/repositories/equipment.repository');
const maintenanceRepo = require('../../src/repositories/maintenance.repository');
const reportRepo = require('../../src/repositories/report.repository');
const usersData = require('./helpers/models/users');
const equipmentsData = require('./helpers/models/equipments');
const maintenanceData = require('./helpers/models/maintenance');

describe('Report Repository Integration Tests', () => {
  let client;
  let n = 0;
  let technician;

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

  const createEquipment = (overrides = {}) =>
    equipmentsRepo.create(
      { ...equipmentsData.equipment1, name: `Report Equipment ${++n}`, ...overrides },
      client
    );

  const createMaintenance = (equipmentId, overrides = {}) =>
    maintenanceRepo.create(
      { ...maintenanceData.maintenance1, equipmentId, ...overrides },
      client
    );

  describe('summary', () => {
    it('counts equipment by status', async () => {
      const before = await reportRepo.summary(client);
      await createEquipment({ status: 'available', equipmentCode: 2 });
      await createEquipment({ status: 'available', equipmentCode: 3});
      await createEquipment({ status: 'out_of_service', equipmentCode: 4 });

      const after = await reportRepo.summary(client);
      expect(after.equipment.total).toBe(before.equipment.total + 3);
      expect(after.equipment.available).toBe(before.equipment.available + 2);
      expect(after.equipment.out_of_service).toBe(before.equipment.out_of_service + 1);
      expect(after.equipment.booked).toBe(before.equipment.booked);
    });

    it('counts overdue maintenance only when scheduled in the past and not finished', async () => {
      const before = await reportRepo.summary(client);
      const equipment = await createEquipment();
      const user = await usersRepo.create(usersData.user2, client)
      const past = '2020-01-01T10:00:00Z';
      const future = '2099-01-01T10:00:00Z';
      await createMaintenance(equipment.id, { scheduledAt: past, status: 'scheduled', technicianId: user.id });   
      await createMaintenance(equipment.id, { scheduledAt: past, status: 'in_progress', technicianId: user.id }); 
      await createMaintenance(equipment.id, { scheduledAt: past, status: 'completed', technicianId: user.id });   
      await createMaintenance(equipment.id, { scheduledAt: future, status: 'scheduled', technicianId: user.id });

      const after = await reportRepo.summary(client);
      expect(after.overdueMaintenance).toBe(before.overdueMaintenance + 2);
    });

    it('returns the expected shape', async () => {
      const result = await reportRepo.summary(client);

      expect(result).toEqual({
        equipment: expect.objectContaining({
          total: expect.any(Number),
          available: expect.any(Number),
          booked: expect.any(Number),
          under_maintenance: expect.any(Number),
          out_of_service: expect.any(Number),
        }),
        outstandingFaults: expect.any(Number),
        overdueMaintenance: expect.any(Number),
        activeBookings: expect.any(Number),
      });
    });
  });

  describe('maintenanceActivity', () => {
    it('groups maintenance records by status', async () => {
      const before = await reportRepo.maintenanceActivity(client);
      const countOf = (rows, status) => rows.find(r => r.status === status)?.count ?? 0;
      const user = await usersRepo.create(usersData.user3, client)

      const equipment = await createEquipment();
      await createMaintenance(equipment.id, { status: 'scheduled', technicianId: user.id });
      await createMaintenance(equipment.id, { status: 'scheduled', technicianId: user.id });
      await createMaintenance(equipment.id, { status: 'completed', technicianId: user.id });

      const after = await reportRepo.maintenanceActivity(client);

      expect(countOf(after, 'scheduled')).toBe(countOf(before, 'scheduled') + 2);
      expect(countOf(after, 'completed')).toBe(countOf(before, 'completed') + 1);
    });

    it('returns rows ordered by status', async () => {
      const user = usersRepo.create(usersData.user1, client)
      const equipment = await createEquipment();
      await createMaintenance(equipment.id, { status: 'scheduled', technicianId: user.id });
      await createMaintenance(equipment.id, { status: 'completed', technicianId: user.id });

      const rows = await reportRepo.maintenanceActivity(client);
      const statuses = rows.map(r => r.status);

      expect(statuses).toEqual([...statuses].sort());
    });
  });
});