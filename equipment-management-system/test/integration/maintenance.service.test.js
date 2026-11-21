const db = require('../../src/database/connection');
const maintenanceService = require('../../src/services/maintenance.service');
const { resetDatabase, createUser, createEquipment, hoursFromNow } = require('./helpers/db');

const ONE_MINUTE = 60 * 1000;

describe('Maintenance Service Integration Tests', () => {
  let technician;
  let equipment;

  const validMaintenance = (overrides = {}) => ({
    equipmentId: equipment.id,
    technicianId: technician.id,
    maintenanceType: 'Preventive inspection',
    description: 'Quarterly inspection',
    scheduledAt: hoursFromNow(48),
    ...overrides
  });

  const getEquipment = async (id = equipment.id) => {
    const { rows } = await db.query('SELECT * FROM equipment WHERE id = $1', [id]);
    return rows[0];
  };

  const getHistory = async (equipmentId = equipment.id) => {
    const { rows } = await db.query(
      'SELECT * FROM equipment_status_history WHERE equipment_id = $1 ORDER BY id',
      [equipmentId]
    );
    return rows;
  };

  const getMaintenance = async (id) => {
    const { rows } = await db.query('SELECT * FROM maintenance WHERE id = $1', [id]);
    return rows[0];
  };

  const countMaintenance = async () => {
    const { rows } = await db.query('SELECT COUNT(*)::int AS total FROM maintenance');
    return rows[0].total;
  };

  // Inserts a record directly so list() tests do not depend on create()/update()
  const insertMaintenance = async ({ technicianId = technician.id, scheduledAt, status = 'scheduled' }) => {
    const { rows } = await db.query(
      `INSERT INTO maintenance(equipment_id, technician_id, maintenance_type, scheduled_at, status)
       VALUES($1, $2, 'Inspection', $3, $4) RETURNING *`,
      [equipment.id, technicianId, scheduledAt, status]
    );
    return rows[0];
  };

  beforeEach(async () => {
    await resetDatabase();
    technician = await createUser({ role: 'technician', fullName: 'test case' });
    equipment = await createEquipment({ code: 'PRJ-001', name: 'Projector' });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await db.pool.end();
  });

  describe('create', () => {
    it('schedules maintenance, takes the equipment out of use immediately and records the status change', async () => {
      const record = await maintenanceService.create(validMaintenance());

      expect(record).toMatchObject({
        equipment_id: equipment.id,
        technician_id: technician.id,
        maintenance_type: 'Preventive inspection',
        status: 'scheduled'
      });

      expect((await getEquipment()).status).toBe('under_maintenance');
      const history = await getHistory();
      expect(history).toHaveLength(1);
      expect(history[0]).toMatchObject({
        old_status: 'available',
        new_status: 'under_maintenance',
        reason: 'Maintenance scheduled',
        changed_by: null
      });
    });

    it.each(['booked', 'out_of_service'])(
      'forces equipment that is "%s" into under_maintenance and records the real old status',
      async (status) => {
        const item = await createEquipment({ status });

        await maintenanceService.create(validMaintenance({ equipmentId: item.id }));

        expect((await getEquipment(item.id)).status).toBe('under_maintenance');
        const history = await getHistory(item.id);
        expect(history).toHaveLength(1);
        expect(history[0]).toMatchObject({ old_status: status, new_status: 'under_maintenance' });
      }
    );

    it('rejects unknown equipment with 404 and writes nothing', async () => {
      await expect(
        maintenanceService.create(validMaintenance({ equipmentId: 999999 }))
      ).rejects.toMatchObject({ statusCode: 404, message: 'Equipment not found.' });

      expect(await countMaintenance()).toBe(0);
      expect(await getHistory(999999)).toHaveLength(0);
    });

    it('rolls back the whole transaction when the insert fails', async () => {
      await expect(
        maintenanceService.create(validMaintenance({ technicianId: 999999 }))
      ).rejects.toMatchObject({ code: '23503' });

      expect((await getEquipment()).status).toBe('available');
      expect(await countMaintenance()).toBe(0);
      expect(await getHistory()).toHaveLength(0);
    });

    it('serialises concurrent scheduling for the same equipment with a row lock', async () => {
      await Promise.all([
        maintenanceService.create(validMaintenance({ maintenanceType: 'First' })),
        maintenanceService.create(validMaintenance({ maintenanceType: 'Second' }))
      ]);

      expect((await getEquipment()).status).toBe('under_maintenance');
      expect(await countMaintenance()).toBe(2);
      const history = await getHistory();
      expect(history.map((h) => h.old_status)).toEqual(['available', 'under_maintenance']);
    });
  });

  describe('list', () => {
    it('returns every record ordered by scheduled_at with joined equipment and technician details', async () => {
      const later = await insertMaintenance({ scheduledAt: hoursFromNow(48), technicianId: null });
      const earlier = await insertMaintenance({ scheduledAt: hoursFromNow(-24), status: 'completed' });

      const rows = await maintenanceService.list();

      expect(rows.map((r) => r.id)).toEqual([earlier.id, later.id]);
      expect(rows[0]).toMatchObject({
        equipment_code: 'PRJ-001',
        equipment_name: 'Projector',
        technician_name: 'test case'
      });
      expect(rows[1].technician_name).toBeNull();
    });

    it('returns only overdue records (past and scheduled or in progress) when overdue is true', async () => {
      const pastScheduled = await insertMaintenance({ scheduledAt: hoursFromNow(-48), status: 'scheduled' });
      const pastInProgress = await insertMaintenance({ scheduledAt: hoursFromNow(-24), status: 'in_progress' });
      await insertMaintenance({ scheduledAt: hoursFromNow(-72), status: 'completed' });
      await insertMaintenance({ scheduledAt: hoursFromNow(-12), status: 'cancelled' });
      await insertMaintenance({ scheduledAt: hoursFromNow(24), status: 'scheduled' });

      const rows = await maintenanceService.list({ overdue: true });

      expect(rows.map((r) => r.id)).toEqual([pastScheduled.id, pastInProgress.id]);
    });
  });

  
});
