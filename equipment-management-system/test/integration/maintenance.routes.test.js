const request = require('supertest');
const jwt = require('jsonwebtoken');
const db = require('../../src/database/connection');
const app = require('../../src/app');
const { resetDatabase, createUser, createEquipment, hoursFromNow } = require('./helpers/db');

require('../../src/config/logger').silent = true;

describe('Maintenance Routes Integration Tests', () => {
  let admin;
  let manager;
  let technician;
  let alice;
  let equipment;

  const tokenFor = (user, role) =>
    jwt.sign({ sub: String(user.id), role }, process.env.JWT_SECRET, { expiresIn: '1h' });

  const makeUser = async (role, fullName) => {
    const user = await createUser({ role, fullName });
    return { ...user, role, token: tokenFor(user, role) };
  };

  // Sends request to the real Express app. user may be null for an anonymous request
  const call = (method, path, user, body) => {
    let req = request(app)[method](path);
    if (user) req = req.set('Authorization', `Bearer ${user.token}`);
    return body === undefined ? req : req.send(body);
  };

  const validBody = (overrides = {}) => ({
    equipmentId: equipment.id,
    technicianId: technician.id,
    maintenanceType: 'Preventive inspection',
    description: 'Quarterly inspection',
    scheduledAt: hoursFromNow(48).toISOString(),
    ...overrides
  });

  const schedule = async (overrides = {}) => {
    const res = await call('post', '/api/maintenance', manager, validBody(overrides));
    expect(res.status).toBe(201);
    return res.body.data;
  };

  // Inserts record directly for tests that need specific dates and statuses
  const insertMaintenance = async ({ technicianId = technician.id, scheduledAt, status = 'scheduled' }) => {
    const { rows } = await db.query(
      `INSERT INTO maintenance(equipment_id, technician_id, maintenance_type, scheduled_at, status)
       VALUES($1, $2, 'Inspection', $3, $4) RETURNING *`,
      [equipment.id, technicianId, scheduledAt, status]
    );
    return rows[0];
  };

  const getEquipment = async () => {
    const { rows } = await db.query('SELECT * FROM equipment WHERE id = $1', [equipment.id]);
    return rows[0];
  };

  const getHistory = async () => {
    const { rows } = await db.query(
      'SELECT * FROM equipment_status_history WHERE equipment_id = $1 ORDER BY id',
      [equipment.id]
    );
    return rows;
  };

  const countMaintenance = async () => {
    const { rows } = await db.query('SELECT COUNT(*)::int AS total FROM maintenance');
    return rows[0].total;
  };

  beforeAll(async () => {
    // migration does not create the manager role but these routes use it
    await db.query("INSERT INTO roles(name) VALUES ('manager') ON CONFLICT (name) DO NOTHING");
  });

  beforeEach(async () => {
    await resetDatabase();
    admin = await makeUser('admin', 'Ada Admin');
    manager = await makeUser('manager', 'Maya Manager');
    technician = await makeUser('technician', 'Terry Technician');
    alice = await makeUser('user', 'Alice User');
    equipment = await createEquipment({ code: 'PRJ-001', name: 'Projector' });
  });

  afterAll(async () => {
    await resetDatabase();
    await db.query("DELETE FROM roles WHERE name = 'manager'");
    await db.pool.end();
  });

  describe('authentication and roles', () => {
    it('rejects a request with no token', async () => {
      const res = await call('get', '/api/maintenance', null);

      expect(res.status).toBe(401);
      expect(res.body).toMatchObject({ success: false, message: 'Authentication token required.' });
    });

    it('does not let a normal user use any maintenance route', async () => {
      const getRes = await call('get', '/api/maintenance', alice);
      const postRes = await call('post', '/api/maintenance', alice, validBody());
      const patchRes = await call('patch', '/api/maintenance/1', alice, { description: 'x' });

      expect([getRes.status, postRes.status, patchRes.status]).toEqual([403, 403, 403]);
      expect(await countMaintenance()).toBe(0);
    });

    it('lets a technician read maintenance but not schedule it', async () => {
      const postRes = await call('post', '/api/maintenance', technician, validBody());
      const getRes = await call('get', '/api/maintenance', technician);

      expect(postRes.status).toBe(403);
      expect(getRes.status).toBe(200);
      expect(await countMaintenance()).toBe(0);
      expect((await getEquipment()).status).toBe('available');
    });
  });

  describe('POST /api/maintenance', () => {
    it('lets a manager schedule maintenance and takes the equipment out of use', async () => {
      const res = await call('post', '/api/maintenance', manager, validBody());

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ success: true, message: 'Maintenance scheduled.' });
      expect(res.body.data).toMatchObject({
        status: 'scheduled',
        equipment_id: equipment.id,
        technician_id: technician.id
      });
      expect((await getEquipment()).status).toBe('under_maintenance');
      const history = await getHistory();
      expect(history).toHaveLength(1);
      expect(history[0]).toMatchObject({
        old_status: 'available',
        new_status: 'under_maintenance',
        reason: 'Maintenance scheduled'
      });
    });

    it('returns 404 for unknown equipment and creates nothing', async () => {
      const res = await call('post', '/api/maintenance', admin, validBody({ equipmentId: 999999 }));

      expect(res.status).toBe(404);
      expect(res.body.message).toBe('Equipment not found.');
      expect(await countMaintenance()).toBe(0);
    });

    it('rejects a body with missing required fields', async () => {
      const res = await call('post', '/api/maintenance', manager, { equipmentId: equipment.id });

      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Validation failed.');
      expect(res.body.details.length).toBeGreaterThanOrEqual(2);
    });

    it('rolls everything back when the technician does not exist', async () => {
      const res = await call('post', '/api/maintenance', manager, validBody({ technicianId: 999999 }));

      expect(res.status).toBe(400);
      expect(res.body.message).toBe('The request references a record that does not exist.');
      expect((await getEquipment()).status).toBe('available');
      expect(await getHistory()).toHaveLength(0);
      expect(await countMaintenance()).toBe(0);
    });

    it('ignores fields the client must not control (status, completedAt)', async () => {
      const res = await call('post', '/api/maintenance', manager, validBody({
        status: 'completed',
        completedAt: new Date().toISOString()
      }));

      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe('scheduled');
      expect(res.body.data.completed_at).toBeNull();
    });
  });

  describe('GET /api/maintenance', () => {
    it('lets a manager, technician and admin list records ordered by date with joined details', async () => {
      const later = await insertMaintenance({ scheduledAt: hoursFromNow(48), technicianId: null });
      const earlier = await insertMaintenance({ scheduledAt: hoursFromNow(-24) });

      for (const user of [manager, technician, admin]) {
        const res = await call('get', '/api/maintenance', user);

        expect(res.status).toBe(200);
        expect(res.body.data.map((row) => row.id)).toEqual([earlier.id, later.id]);
        expect(res.body.data[0]).toMatchObject({
          equipment_code: 'PRJ-001',
          equipment_name: 'Projector',
          technician_name: 'Terry Technician'
        });
        expect(res.body.data[1].technician_name).toBeNull();
      }
    });

    it('returns only overdue records when overdue=true', async () => {
      const pastScheduled = await insertMaintenance({ scheduledAt: hoursFromNow(-48), status: 'scheduled' });
      const pastInProgress = await insertMaintenance({ scheduledAt: hoursFromNow(-24), status: 'in_progress' });
      await insertMaintenance({ scheduledAt: hoursFromNow(-72), status: 'completed' });
      await insertMaintenance({ scheduledAt: hoursFromNow(-12), status: 'cancelled' });
      await insertMaintenance({ scheduledAt: hoursFromNow(24), status: 'scheduled' });

      const res = await call('get', '/api/maintenance?overdue=true', manager);

      expect(res.status).toBe(200);
      expect(res.body.data.map((row) => row.id)).toEqual([pastScheduled.id, pastInProgress.id]);
    });

    // only the exact text "true" filters
    it('does not treat overdue=TRUE or overdue=1 as a filter and returns every record', async () => {
      await insertMaintenance({ scheduledAt: hoursFromNow(-48), status: 'scheduled' });
      await insertMaintenance({ scheduledAt: hoursFromNow(24), status: 'scheduled' });

      for (const value of ['TRUE', '1']) {
        const res = await call('get', `/api/maintenance?overdue=${value}`, manager);

        expect(res.status).toBe(200);
        expect(res.body.data).toHaveLength(2);
      }
    });
  });

  describe('PATCH /api/maintenance/:id', () => {
    let record;

    beforeEach(async () => {
      record = await schedule();
    });

    it('lets a technician complete maintenance and puts the equipment back in service', async () => {
      const res = await call('patch', `/api/maintenance/${record.id}`, technician, { status: 'completed' });

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Maintenance updated.');
      expect(res.body.data.status).toBe('completed');
      expect(res.body.data.completed_at).not.toBeNull();
      expect((await getEquipment()).status).toBe('available');
      const history = await getHistory();
      expect(history).toHaveLength(2);
      expect(history[1]).toMatchObject({ old_status: 'under_maintenance', new_status: 'available', reason: 'Maintenance completed' });
    });

    it('lets a technician change the description and reassign without touching the equipment', async () => {
      const other = await createUser({ role: 'technician', fullName: 'Tina Technician' });

      const res = await call('patch', `/api/maintenance/${record.id}`, technician, {
        description: 'Rescheduled inspection',
        technicianId: other.id
      });

      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ description: 'Rescheduled inspection', technician_id: other.id });
      expect((await getEquipment()).status).toBe('under_maintenance');
      expect(await getHistory()).toHaveLength(1);
    });

    // cancelling does not release the equipment
    it('leaves the equipment under maintenance when the maintenance is cancelled', async () => {
      const res = await call('patch', `/api/maintenance/${record.id}`, manager, { status: 'cancelled' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('cancelled');
      expect((await getEquipment()).status).toBe('under_maintenance');
    });

    it('returns 404 for a record that does not exist', async () => {
      const res = await call('patch', '/api/maintenance/999999', technician, { status: 'in_progress' });

      expect(res.status).toBe(404);
      expect(res.body.message).toBe('Maintenance record not found.');
    });

    it('rejects an empty update and an invalid status', async () => {
      const emptyRes = await call('patch', `/api/maintenance/${record.id}`, technician, {});
      const invalidRes = await call('patch', `/api/maintenance/${record.id}`, technician, { status: 'done' });

      expect(emptyRes.status).toBe(400);
      expect(emptyRes.body.message).toBe('Validation failed.');
      expect(invalidRes.status).toBe(400);
      expect(invalidRes.body.message).toBe('Validation failed.');
    });

    it('maps a non-numeric id to a 400 error', async () => {
      const res = await call('patch', '/api/maintenance/abc', technician, { status: 'in_progress' });

      expect(res.status).toBe(400);
      expect(res.body.message).toBe('The supplied data is invalid.');
    });
  });
});
