const request = require('supertest');
const jwt = require('jsonwebtoken');
const db = require('../../src/database/connection');
const app = require('../../src/app');
const { resetDatabase, createUser, createEquipment, hoursFromNow } = require('./helpers/db');

require('../../src/config/logger').silent = true;

const ONE_MINUTE = 60 * 1000;

describe('Fault Routes Integration Tests', () => {
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

  // Sends request to the real Express app user may be null for an anonymous request
  const call = (method, path, user, body) => {
    let req = request(app)[method](path);
    if (user) req = req.set('Authorization', `Bearer ${user.token}`);
    return body === undefined ? req : req.send(body);
  };

  const insertFault = async ({ description = 'The display turns black.', severity = 'medium', status = 'open', reportedAt } = {}) => {
    const { rows } = await db.query(
      `INSERT INTO faults(equipment_id, reported_by, description, severity, status, reported_at)
       VALUES($1, $2, $3, $4, $5, COALESCE($6, NOW())) RETURNING *`,
      [equipment.id, alice.id, description, severity, status, reportedAt || null]
    );
    return rows[0];
  };

  const getFault = async (id) => {
    const { rows } = await db.query('SELECT * FROM faults WHERE id = $1', [id]);
    return rows[0];
  };

  const countFaults = async () => {
    const { rows } = await db.query('SELECT COUNT(*)::int AS total FROM faults');
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
    alice = await makeUser('user', 'Alice Reporter');
    equipment = await createEquipment({ code: 'LAP-001', name: 'Dell Laptop' });
  });

  afterAll(async () => {
    await resetDatabase();
    await db.query("DELETE FROM roles WHERE name = 'manager'");
    await db.pool.end();
  });

  describe('authentication and roles', () => {
    it('rejects a request with no token', async () => {
      const res = await call('post', '/api/faults', null, {
        equipmentId: equipment.id,
        description: 'The display turns black.'
      });

      expect(res.status).toBe(401);
      expect(res.body).toMatchObject({ success: false, message: 'Authentication token required.' });
    });

    it('rejects a token signed with a different secret', async () => {
      const forged = jwt.sign({ sub: String(alice.id), role: 'user' }, 'a-completely-different-secret-value-123456');

      const res = await request(app).get('/api/faults').set('Authorization', `Bearer ${forged}`);

      expect(res.status).toBe(401);
      expect(res.body.message).toBe('Invalid or expired authentication token.');
    });

    it('does not let a normal user list faults', async () => {
      const res = await call('get', '/api/faults', alice);

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('permission');
    });

    it('lets a technician, manager and admin list faults', async () => {
      for (const user of [technician, manager, admin]) {
        const res = await call('get', '/api/faults', user);

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body.data)).toBe(true);
      }
    });
  });

  describe('POST /api/faults', () => {
    it('lets a user report a fault, applying the default severity', async () => {
      const res = await call('post', '/api/faults', alice, {
        equipmentId: equipment.id,
        description: 'The display intermittently turns black.'
      });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ success: true, message: 'Fault reported.' });
      expect(res.body.data).toMatchObject({
        status: 'open',
        severity: 'medium',
        reported_by: alice.id,
        equipment_id: equipment.id
      });
      expect(await getFault(res.body.data.id)).toMatchObject({ description: 'The display intermittently turns black.' });
    });

    it('ignores fields the client must not control (reportedBy, status)', async () => {
      const res = await call('post', '/api/faults', alice, {
        equipmentId: equipment.id,
        description: 'The display intermittently turns black.',
        reportedBy: technician.id,
        status: 'resolved'
      });

      expect(res.status).toBe(201);
      expect(res.body.data.reported_by).toBe(alice.id);
      expect(res.body.data.status).toBe('open');
      expect(res.body.data.resolved_at).toBeNull();
    });

    it('rejects a description that is too short and stores nothing', async () => {
      const res = await call('post', '/api/faults', alice, { equipmentId: equipment.id, description: 'bad' });

      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Validation failed.');
      expect(res.body.details.length).toBeGreaterThan(0);
      expect(await countFaults()).toBe(0);
    });

    it('returns 404 for equipment that does not exist', async () => {
      const res = await call('post', '/api/faults', alice, {
        equipmentId: 999999,
        description: 'The display intermittently turns black.'
      });

      expect(res.status).toBe(404);
      expect(res.body.message).toBe('Equipment not found.');
    });
  });

  describe('GET /api/faults', () => {
    it('lists faults newest first with equipment and reporter details', async () => {
      const oldest = await insertFault({ description: 'Oldest', reportedAt: hoursFromNow(-3) });
      const newest = await insertFault({ description: 'Newest', reportedAt: hoursFromNow(-1) });
      const middle = await insertFault({ description: 'Middle', reportedAt: hoursFromNow(-2) });

      const res = await call('get', '/api/faults', technician);

      expect(res.status).toBe(200);
      expect(res.body.data.map((row) => row.id)).toEqual([newest.id, middle.id, oldest.id]);
      expect(res.body.data[0]).toMatchObject({
        equipment_code: 'LAP-001',
        equipment_name: 'Dell Laptop',
        reporter: 'Alice Reporter'
      });
    });

    it('filters by status, and returns an empty list when nothing matches', async () => {
      const open = await insertFault({ status: 'open' });
      await insertFault({ status: 'resolved' });

      const openRes = await call('get', '/api/faults?status=open', technician);
      const closedRes = await call('get', '/api/faults?status=closed', technician);

      expect(openRes.body.data.map((row) => row.id)).toEqual([open.id]);
      expect(closedRes.status).toBe(200);
      expect(closedRes.body.data).toEqual([]);
    });
  });

  describe('PATCH /api/faults/:id', () => {
    let fault;

    beforeEach(async () => {
      fault = await insertFault({ severity: 'low' });
    });

    it('lets a technician assign, start work on and re-grade a fault', async () => {
      const res = await call('patch', `/api/faults/${fault.id}`, technician, {
        assignedTo: technician.id,
        status: 'in_progress',
        severity: 'high'
      });

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Fault updated.');
      expect(res.body.data).toMatchObject({
        assigned_to: technician.id,
        status: 'in_progress',
        severity: 'high',
        resolved_at: null
      });
    });

    it('records when a manager resolves a fault', async () => {
      const res = await call('patch', `/api/faults/${fault.id}`, manager, { status: 'resolved' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('resolved');
      expect(Math.abs(new Date(res.body.data.resolved_at).getTime() - Date.now())).toBeLessThan(ONE_MINUTE);
    });

    it('does not let a normal user update a fault', async () => {
      const res = await call('patch', `/api/faults/${fault.id}`, alice, { status: 'closed' });

      expect(res.status).toBe(403);
      expect((await getFault(fault.id)).status).toBe('open');
    });

    it('returns 404 for a fault that does not exist', async () => {
      const res = await call('patch', '/api/faults/999999', technician, { status: 'in_progress' });

      expect(res.status).toBe(404);
      expect(res.body.message).toBe('Fault report not found.');
    });

    it('rejects an empty update', async () => {
      const res = await call('patch', `/api/faults/${fault.id}`, technician, {});

      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Validation failed.');
    });

    it('maps a non-numeric id to a 400 error', async () => {
      const res = await call('patch', '/api/faults/abc', technician, { status: 'in_progress' });

      expect(res.status).toBe(400);
      expect(res.body.message).toBe('The supplied data is invalid.');
    });

    it('maps an unknown assignee to a 400 error', async () => {
      const res = await call('patch', `/api/faults/${fault.id}`, technician, { assignedTo: 999999 });

      expect(res.status).toBe(400);
      expect(res.body.message).toBe('The request references a record that does not exist.');
      expect((await getFault(fault.id)).assigned_to).toBeNull();
    });
  });
});
