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
    await resetDatabase();
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

  describe('update', () => {
    let record;

    beforeEach(async () => {
      record = await maintenanceService.create(validMaintenance());
    });

    it('rejects an unknown id with 404', async () => {
      await expect(
        maintenanceService.update(999999, { description: 'x' })
      ).rejects.toMatchObject({ statusCode: 404, message: 'Maintenance record not found.' });
    });

    it('updates fields without touching the equipment when no status is given', async () => {
      const otherTechnician = await createUser({ role: 'technician', fullName: 'Tina Technician' });

      const updated = await maintenanceService.update(record.id, {
        technicianId: otherTechnician.id,
        description: 'Rescheduled inspection'
      });

      expect(updated).toMatchObject({
        technician_id: otherTechnician.id,
        description: 'Rescheduled inspection',
        status: 'scheduled'
      });
      expect((await getEquipment()).status).toBe('under_maintenance');
      expect(await getHistory()).toHaveLength(1);
    });

    it('completes the record and returns the equipment to available with a history row', async () => {
      const updated = await maintenanceService.update(record.id, { status: 'completed' });

      expect(updated.status).toBe('completed');
      expect(updated.completed_at).toBeInstanceOf(Date);
      expect(Math.abs(updated.completed_at.getTime() - Date.now())).toBeLessThan(ONE_MINUTE);
      expect((await getEquipment()).status).toBe('available');
      const history = await getHistory();
      expect(history).toHaveLength(2);
      expect(history[1]).toMatchObject({
        old_status: 'under_maintenance',
        new_status: 'available',
        reason: 'Maintenance completed',
        changed_by: null
      });
    });

    it('completes the record but leaves the equipment alone when it is not under maintenance', async () => {
      await db.query("UPDATE equipment SET status = 'out_of_service' WHERE id = $1", [equipment.id]);

      const updated = await maintenanceService.update(record.id, { status: 'completed' });

      expect(updated.status).toBe('completed');
      expect((await getEquipment()).status).toBe('out_of_service');
      expect(await getHistory()).toHaveLength(1);
    });

    it('does not change the equipment when the status becomes in_progress', async () => {
      const updated = await maintenanceService.update(record.id, { status: 'in_progress' });

      expect(updated.status).toBe('in_progress');
      expect((await getEquipment()).status).toBe('under_maintenance');
      expect(await getHistory()).toHaveLength(1);
    });

    it('leaves the equipment under_maintenance when the maintenance is cancelled', async () => {
      const updated = await maintenanceService.update(record.id, { status: 'cancelled' });

      expect(updated.status).toBe('cancelled');
      expect((await getEquipment()).status).toBe('under_maintenance');
    });

    it('propagates a database error and changes nothing', async () => {
      await expect(
        maintenanceService.update(record.id, { status: 'done' })
      ).rejects.toMatchObject({ code: '23514' });

      expect((await getMaintenance(record.id)).status).toBe('scheduled');
      expect((await getEquipment()).status).toBe('under_maintenance');
    });

    it('leaves the record completed but the equipment under_maintenance when the second transaction fails', async () => {
      jest.spyOn(db, 'withTransaction').mockRejectedValueOnce(new Error('boom'));

      await expect(
        maintenanceService.update(record.id, { status: 'completed' })
      ).rejects.toThrow('boom');

      expect((await getMaintenance(record.id)).status).toBe('completed');
      expect((await getEquipment()).status).toBe('under_maintenance');
    });
  });
});
