const db = require('../../src/database/connection');
const faultRepository = require('../../src/repositories/fault.repository');
const { resetDatabase, createUser, createEquipment, hoursFromNow } = require('./helpers/db');

const ONE_MINUTE = 60 * 1000;

describe('Fault Repository Integration Tests', () => {
  let reporter;
  let technician;
  let equipment;

  const validFault = (overrides = {}) => ({
    equipmentId: equipment.id,
    reportedBy: reporter.id,
    description: 'The display intermittently turns black.',
    severity: 'high',
    ...overrides
  });

  const setReportedAt = (id, date) =>
    db.query('UPDATE faults SET reported_at = $1 WHERE id = $2', [date, id]);

  beforeEach(async () => {
    await resetDatabase();
    reporter = await createUser({ role: 'user', fullName: 'Alice Reporter' });
    technician = await createUser({ role: 'technician', fullName: 'Terry Technician' });
    equipment = await createEquipment({ code: 'LAP-001', name: 'Dell Laptop' });
  });

  afterAll(async () => {
    // Leave the shared database empty tests are committed (no rollback), and other test files
    // (user, report) assume no leftover rows
    await resetDatabase();
    await db.pool.end();
  });

  describe('create', () => {
    it('inserts fault and returns the row with database defaults applied', async () => {
      const fault = await faultRepository.create(validFault());

      expect(fault).toMatchObject({
        equipment_id: equipment.id,
        reported_by: reporter.id,
        assigned_to: null,
        description: 'The display intermittently turns black.',
        severity: 'high',
        status: 'open',
        resolved_at: null
      });
      expect(typeof fault.id).toBe('string');
      expect(fault.reported_at).toBeInstanceOf(Date);
      expect(Math.abs(fault.reported_at.getTime() - Date.now())).toBeLessThan(ONE_MINUTE);
    });

    it('rejects an invalid severity with a CHECK violation', async () => {
      await expect(
        faultRepository.create(validFault({ severity: 'urgent' }))
      ).rejects.toMatchObject({ code: '23514' });
    });

    it('rejects a fault for equipment that does not exist', async () => {
      await expect(
        faultRepository.create(validFault({ equipmentId: 999999 }))
      ).rejects.toMatchObject({ code: '23503' });
    });
  });

  describe('findById', () => {
    it('returns the fault when it exists', async () => {
      const created = await faultRepository.create(validFault());

      const found = await faultRepository.findById(created.id);

      expect(found).toEqual(created);
    });

    it('returns null when the fault does not exist', async () => {
      await expect(faultRepository.findById(999999)).resolves.toBeNull();
    });
  });

  describe('list', () => {
    let older;
    let newer;
    let resolved;

    const seedFaults = async () => {
      older = await faultRepository.create(validFault({ description: 'Older open fault' }));
      newer = await faultRepository.create(validFault({ description: 'Newer open fault' }));
      resolved = await faultRepository.create(validFault({ description: 'Resolved fault' }));
      await db.query("UPDATE faults SET status = 'resolved' WHERE id = $1", [resolved.id]);
      await setReportedAt(older.id, hoursFromNow(-3));
      await setReportedAt(newer.id, hoursFromNow(-1));
      await setReportedAt(resolved.id, hoursFromNow(-2));
    };

    it('returns an empty array when there are no faults', async () => {
      await expect(faultRepository.list()).resolves.toEqual([]);
    });

    it('returns every fault newest reported first, with joined equipment and reporter details', async () => {
      await seedFaults();

      const rows = await faultRepository.list();

      expect(rows.map((r) => r.id)).toEqual([newer.id, resolved.id, older.id]);
      expect(rows[0]).toMatchObject({
        equipment_code: 'LAP-001',
        equipment_name: 'Dell Laptop',
        reporter: 'Alice Reporter'
      });
    });

    it('filters by status', async () => {
      await seedFaults();

      const open = await faultRepository.list('open');
      const resolvedRows = await faultRepository.list('resolved');

      expect(open.map((r) => r.id)).toEqual([newer.id, older.id]);
      expect(resolvedRows.map((r) => r.id)).toEqual([resolved.id]);
    });

    it('returns an empty array when no fault has the requested status', async () => {
      await seedFaults();

      await expect(faultRepository.list('closed')).resolves.toEqual([]);
    });
  });

  describe('update', () => {
    let fault;

    beforeEach(async () => {
      fault = await faultRepository.create(validFault({ severity: 'medium' }));
    });

    it('updates several fields at once, including assigning a technician', async () => {
      const updated = await faultRepository.update(fault.id, {
        assignedTo: technician.id,
        status: 'in_progress',
        severity: 'high',
        description: 'Screen flickers then turns black.'
      });

      expect(updated).toMatchObject({
        assigned_to: technician.id,
        status: 'in_progress',
        severity: 'high',
        description: 'Screen flickers then turns black.'
      });
    });

    it('sets resolved_at when the status changes to resolved', async () => {
      const updated = await faultRepository.update(fault.id, { status: 'resolved' });

      expect(updated.status).toBe('resolved');
      expect(updated.resolved_at).toBeInstanceOf(Date);
      expect(Math.abs(updated.resolved_at.getTime() - Date.now())).toBeLessThan(ONE_MINUTE);
    });

    it('does not set resolved_at for a status other than resolved', async () => {
      const updated = await faultRepository.update(fault.id, { status: 'in_progress' });

      expect(updated.status).toBe('in_progress');
      expect(updated.resolved_at).toBeNull();
    });

    it('keeps resolved_at when a resolved fault is reopened (current behaviour)', async () => {
      const resolvedFault = await faultRepository.update(fault.id, { status: 'resolved' });

      const reopened = await faultRepository.update(fault.id, { status: 'open' });

      expect(reopened.status).toBe('open');
      expect(reopened.resolved_at).toEqual(resolvedFault.resolved_at);
    });

    it('ignores keys that are not updatable columns and leaves other columns unchanged', async () => {
      const updated = await faultRepository.update(fault.id, {
        severity: 'low',
        reportedBy: technician.id,
        equipmentId: 999999
      });

      expect(updated.severity).toBe('low');
      expect(updated.status).toBe('open');
      expect(updated.description).toBe(fault.description);
      expect(updated.reported_by).toBe(reporter.id);
      expect(updated.equipment_id).toBe(equipment.id);
    });

    it('returns null when the fault does not exist', async () => {
      await expect(
        faultRepository.update(999999, { severity: 'low' })
      ).resolves.toBeNull();
    });

    it('rejects assigning a user that does not exist', async () => {
      await expect(
        faultRepository.update(fault.id, { assignedTo: 999999 })
      ).rejects.toMatchObject({ code: '23503' });
    });

    it('rejects an update with no updatable fields with a SQL syntax error', async () => {
      await expect(faultRepository.update(fault.id, {})).rejects.toMatchObject({ code: '42601' });
    });
  });
});
