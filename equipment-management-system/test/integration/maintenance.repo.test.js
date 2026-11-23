const db = require('../../src/database/connection');
const maintenanceRepository = require('../../src/repositories/maintenance.repository');
const { resetDatabase, createUser, createEquipment, hoursFromNow } = require('./helpers/db');

const ONE_MINUTE = 60 * 1000;

describe('Maintenance Repository Integration Tests', () => {
  let technician;
  let equipment;

  const validMaintenance = (overrides = {}) => ({
    equipmentId: equipment.id,
    technicianId: technician.id,
    maintenanceType: 'Preventive inspection',
    description: 'Quarterly inspection',
    scheduledAt: hoursFromNow(24),
    ...overrides
  });

  // Inserts a record directly so list() tests do not depend on create()/update()
  const insertMaintenance = async ({ technicianId = technician.id, scheduledAt, status = 'scheduled', type = 'Inspection' }) => {
    const { rows } = await db.query(
      `INSERT INTO maintenance(equipment_id, technician_id, maintenance_type, scheduled_at, status)
       VALUES($1, $2, $3, $4, $5) RETURNING *`,
      [equipment.id, technicianId, type, scheduledAt, status]
    );
    return rows[0];
  };

  beforeEach(async () => {
    await resetDatabase();
    technician = await createUser({ role: 'technician', fullName: 'Terry Technician' });
    equipment = await createEquipment({ code: 'PRJ-001', name: 'Projector' });
  });

  afterAll(async () => {
    // Leave the shared database empty: tests are committed (no rollback), and other test files
    // (user, report) assume there leftover rows
    await resetDatabase();
    await db.pool.end();
  });

  describe('create', () => {
    it('inserts a maintenance record and returns the row with database defaults applied', async () => {
      const scheduledAt = hoursFromNow(48);

      const record = await maintenanceRepository.create(validMaintenance({ scheduledAt }));

      expect(record).toMatchObject({
        equipment_id: equipment.id,
        technician_id: technician.id,
        maintenance_type: 'Preventive inspection',
        description: 'Quarterly inspection',
        status: 'scheduled',
        completed_at: null
      });
      expect(typeof record.id).toBe('string');
      expect(record.scheduled_at.getTime()).toBe(scheduledAt.getTime());
      expect(record.created_at).toBeInstanceOf(Date);
    });

    it('stores null for an omitted technician and for an empty description', async () => {
      const record = await maintenanceRepository.create(
        validMaintenance({ technicianId: undefined, description: '' })
      );

      expect(record.technician_id).toBeNull();
      expect(record.description).toBeNull();
    });

    it('runs inside the caller\'s transaction when a client is passed', async () => {
      const client = await db.pool.connect();
      let record;
      try {
        await client.query('BEGIN');

        record = await maintenanceRepository.create(validMaintenance(), client);

        const insideTransaction = await client.query('SELECT id FROM maintenance WHERE id = $1', [record.id]);
        const outsideTransaction = await db.query('SELECT id FROM maintenance WHERE id = $1', [record.id]);
        expect(insideTransaction.rowCount).toBe(1);
        expect(outsideTransaction.rowCount).toBe(0);

        await client.query('ROLLBACK');
      } finally {
        client.release();
      }

      await expect(maintenanceRepository.findById(record.id)).resolves.toBeNull();
    });

    it('rejects a record for equipment that does not exist', async () => {
      await expect(
        maintenanceRepository.create(validMaintenance({ equipmentId: 999999 }))
      ).rejects.toMatchObject({ code: '23503' });
    });

    it('accepts a maintenanceType of exactly 100 characters', async () => {
      const record = await maintenanceRepository.create(
        validMaintenance({ maintenanceType: 'x'.repeat(100) })
      );

      expect(record.maintenance_type).toHaveLength(100);
    });

    it('rejects a maintenanceType longer than 100 characters', async () => {
      await expect(
        maintenanceRepository.create(validMaintenance({ maintenanceType: 'x'.repeat(101) }))
      ).rejects.toMatchObject({ code: '22001' });
    });
  });

  describe('findById', () => {
    it('returns the record when it exists', async () => {
      const created = await maintenanceRepository.create(validMaintenance());

      const found = await maintenanceRepository.findById(created.id);

      expect(found).toEqual(created);
    });

    it('returns null when the record does not exist', async () => {
      await expect(maintenanceRepository.findById(999999)).resolves.toBeNull();
    });
  });

  describe('list', () => {
    let pastScheduled;
    let pastInProgress;
    let pastCompleted;
    let pastCancelled;
    let futureScheduled;
    let unassigned;

    const seedRecords = async () => {
      pastScheduled = await insertMaintenance({ scheduledAt: hoursFromNow(-48), status: 'scheduled' });
      pastInProgress = await insertMaintenance({ scheduledAt: hoursFromNow(-24), status: 'in_progress' });
      pastCompleted = await insertMaintenance({ scheduledAt: hoursFromNow(-72), status: 'completed' });
      pastCancelled = await insertMaintenance({ scheduledAt: hoursFromNow(-12), status: 'cancelled' });
      futureScheduled = await insertMaintenance({ scheduledAt: hoursFromNow(24), status: 'scheduled' });
      unassigned = await insertMaintenance({ scheduledAt: hoursFromNow(48), technicianId: null });
    };

    it('returns every record ordered by scheduled_at, with joined equipment and technician details', async () => {
      await seedRecords();

      const rows = await maintenanceRepository.list();

      expect(rows.map((r) => r.id)).toEqual([
        pastCompleted.id,
        pastScheduled.id,
        pastInProgress.id,
        pastCancelled.id,
        futureScheduled.id,
        unassigned.id
      ]);
      expect(rows.find((r) => r.id === pastScheduled.id)).toMatchObject({
        equipment_code: 'PRJ-001',
        equipment_name: 'Projector',
        technician_name: 'Terry Technician'
      });
    });

    it('includes unassigned records with a null technician_name (LEFT JOIN)', async () => {
      await seedRecords();

      const rows = await maintenanceRepository.list();
      const row = rows.find((r) => r.id === unassigned.id);

      expect(row).toBeDefined();
      expect(row.technician_id).toBeNull();
      expect(row.technician_name).toBeNull();
    });

    it('returns only past records that are scheduled or in progress when overdue is true', async () => {
      await seedRecords();

      const rows = await maintenanceRepository.list({ overdue: true });

      expect(rows.map((r) => r.id)).toEqual([pastScheduled.id, pastInProgress.id]);
    });
  });

  describe('update', () => {
    let record;

    beforeEach(async () => {
      record = await maintenanceRepository.create(validMaintenance());
    });

    it('updates several fields at once', async () => {
      const otherTechnician = await createUser({ role: 'technician', fullName: 'Tina Technician' });
      const scheduledAt = hoursFromNow(72);

      const updated = await maintenanceRepository.update(record.id, {
        technicianId: otherTechnician.id,
        description: 'Rescheduled inspection',
        scheduledAt,
        status: 'in_progress'
      });

      expect(updated).toMatchObject({
        technician_id: otherTechnician.id,
        description: 'Rescheduled inspection',
        status: 'in_progress'
      });
      expect(updated.scheduled_at.getTime()).toBe(scheduledAt.getTime());
    });

    it('sets completed_at when the status changes to completed', async () => {
      const updated = await maintenanceRepository.update(record.id, { status: 'completed' });

      expect(updated.status).toBe('completed');
      expect(updated.completed_at).toBeInstanceOf(Date);
      expect(Math.abs(updated.completed_at.getTime() - Date.now())).toBeLessThan(ONE_MINUTE);
    });

    it('does not set completed_at for a status other than completed', async () => {
      const updated = await maintenanceRepository.update(record.id, { status: 'in_progress' });

      expect(updated.status).toBe('in_progress');
      expect(updated.completed_at).toBeNull();
    });

    it('ignores keys that are not updatable columns and leaves other columns unchanged', async () => {
      const updated = await maintenanceRepository.update(record.id, {
        description: 'Updated',
        equipmentId: 999999,
        completedAt: new Date(0)
      });

      expect(updated.description).toBe('Updated');
      expect(updated.maintenance_type).toBe(record.maintenance_type);
      expect(updated.status).toBe('scheduled');
      expect(updated.equipment_id).toBe(equipment.id);
      expect(updated.completed_at).toBeNull();
    });

    it('returns null when the record does not exist', async () => {
      await expect(
        maintenanceRepository.update(999999, { description: 'x' })
      ).resolves.toBeNull();
    });

    it('rejects an update with no updatable fields with a SQL syntax error', async () => {
      await expect(maintenanceRepository.update(record.id, {})).rejects.toMatchObject({ code: '42601' });
    });
  });
});
