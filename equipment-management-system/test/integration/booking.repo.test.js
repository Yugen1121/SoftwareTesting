const db = require('../../src/database/connection');
const usersRepo = require('../../src/repositories/user.repository');
const equipmentsRepo = require('../../src/repositories/equipment.repository');
const bookingRepository = require('../../src/repositories/booking.repository');
const usersData = require('./helpers/models/users');
const equipmentsData = require('./helpers/models/equipments');

// PostgreSQL error codes the database raises when a constraint is broken.
const PG_NOT_NULL_VIOLATION = '23502';
const PG_INVALID_DATETIME = '22007';
const PG_FOREIGN_KEY_VIOLATION = '23503';
const PG_CHECK_VIOLATION = '23514';
const PG_EXCLUSION_VIOLATION = '23P01'; // bookings_no_overlap

describe('Booking Repository Integration Tests', () => {
  let client;
  let n = 0;

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

  const createUser = (overrides = {}, conn = client) =>
    usersRepo.create(
      { ...usersData.user1, email: `booking-user-${++n}@example.com`, ...overrides },
      conn
    );

  const createEquipment = (overrides = {}, conn = client) =>
    equipmentsRepo.create(
      { ...equipmentsData.equipment1, equipmentCode: `BOOK-EQ-${++n}`, ...overrides },
      conn
    );

  const createBooking = (equipmentId, userId, overrides = {}, conn = client) =>
    bookingRepository.create(
      {
        equipmentId,
        userId,
        startAt: '2026-11-20T10:00:00Z',
        endAt: '2026-11-20T12:00:00Z',
        purpose: 'Integration testing',
        ...overrides
      },
      conn
    );

  const setup = async () => {
    const user = await createUser();
    const equipment = await createEquipment();
    const booking = await createBooking(equipment.id, user.id);
    return { user, equipment, booking };
  };

  describe('create', () => {
    it('creates a confirmed booking with the given details', async () => {
      const { user, equipment, booking } = await setup();

      expect(booking.id).toBeDefined();
      expect(booking.equipment_id).toBe(equipment.id);
      expect(booking.user_id).toBe(user.id);
      expect(booking.purpose).toBe('Integration testing');
      expect(booking.status).toBe('confirmed');
      expect(new Date(booking.start_at)).toEqual(new Date('2026-11-20T10:00:00Z'));
      expect(new Date(booking.end_at)).toEqual(new Date('2026-11-20T12:00:00Z'));
      expect(booking.created_at).toBeDefined();
    });

    it('stores a null purpose when none is given', async () => {
      const user = await createUser();
      const equipment = await createEquipment();

      const booking = await createBooking(equipment.id, user.id, { purpose: undefined });

      expect(booking.purpose).toBeNull();
    });

    it.each([
      ['before', '2026-11-20T12:00:00Z', '2026-11-20T10:00:00Z'],
      ['equal to', '2026-11-20T10:00:00Z', '2026-11-20T10:00:00Z']
    ])('rejects a booking whose end time is %s its start time', async (_, startAt, endAt) => {
      const user = await createUser();
      const equipment = await createEquipment();

      await expect(
        createBooking(equipment.id, user.id, { startAt, endAt })
      ).rejects.toMatchObject({ code: PG_CHECK_VIOLATION });
    });

    it.each(['equipment', 'user'])('rejects a booking when the %s does not exist', async (missing) => {
      const user = await createUser();
      const equipment = await createEquipment();
      const equipmentId = missing === 'equipment' ? 999999999 : equipment.id;
      const userId = missing === 'user' ? 999999999 : user.id;

      await expect(
        createBooking(equipmentId, userId)
      ).rejects.toMatchObject({ code: PG_FOREIGN_KEY_VIOLATION });
    });

    it.each(['startAt', 'endAt'])('rejects a booking with no %s', async (field) => {
      const user = await createUser();
      const equipment = await createEquipment();

      await expect(
        createBooking(equipment.id, user.id, { [field]: undefined })
      ).rejects.toMatchObject({ code: PG_NOT_NULL_VIOLATION });
    });

    it('rejects a booking with a start time that is not a date', async () => {
      const user = await createUser();
      const equipment = await createEquipment();

      await expect(
        createBooking(equipment.id, user.id, { startAt: 'not-a-date' })
      ).rejects.toMatchObject({ code: PG_INVALID_DATETIME });
    });
  });

  describe('overlapping bookings (bookings_no_overlap)', () => {
    it.each([
      ['the same user', false],
      ['a different user', true]
    ])('rejects an overlapping booking on the same equipment by %s', async (_, differentUser) => {
      const { user, equipment } = await setup();
      const booker = differentUser ? await createUser() : user;

      await expect(
        createBooking(equipment.id, booker.id, {
          startAt: '2026-11-20T11:00:00Z',
          endAt: '2026-11-20T13:00:00Z'
        })
      ).rejects.toMatchObject({ code: PG_EXCLUSION_VIOLATION });
    });

    it('allows a booking that starts exactly when the previous one ends', async () => {
      const { user, equipment } = await setup(); 

      const next = await createBooking(equipment.id, user.id, {
        startAt: '2026-11-20T12:00:00Z',
        endAt: '2026-11-20T14:00:00Z'
      });

      expect(next.id).toBeDefined();
    });

    it('allows overlapping times on different equipment', async () => {
      const { user } = await setup();
      const otherEquipment = await createEquipment();

      const other = await createBooking(otherEquipment.id, user.id);

      expect(other.equipment_id).toBe(otherEquipment.id);
    });

    it('allows a new booking over the time of a cancelled booking', async () => {
      const { user, equipment, booking } = await setup();
      await bookingRepository.update(booking.id, { status: 'cancelled' }, client);

      const replacement = await createBooking(equipment.id, user.id);

      expect(replacement.status).toBe('confirmed');
    });
  });

  describe('findById', () => {
    it('returns the booking with the given id, with and without row locking', async () => {
      const { booking } = await setup();

      expect(await bookingRepository.findById(booking.id, client)).toEqual(booking);
      expect(await bookingRepository.findById(booking.id, client, true)).toEqual(booking);
    });

    it('returns null when no booking has the given id', async () => {
      expect(await bookingRepository.findById(999999999, client)).toBeNull();
    });
  });

  describe('update', () => {
    it('updates the start and end times', async () => {
      const { booking } = await setup();

      const updated = await bookingRepository.update(booking.id, {
        startAt: '2026-11-22T08:00:00Z',
        endAt: '2026-11-22T09:00:00Z'
      }, client);

      expect(new Date(updated.start_at)).toEqual(new Date('2026-11-22T08:00:00Z'));
      expect(new Date(updated.end_at)).toEqual(new Date('2026-11-22T09:00:00Z'));
    });

    it('only changes allowed fields and ignores the rest', async () => {
      const { user, equipment, booking } = await setup();
      const otherUser = await createUser();

      const updated = await bookingRepository.update(booking.id, {
        purpose: 'New purpose',
        userId: otherUser.id,      
        equipmentId: 999999999     
      }, client);

      expect(updated).toEqual({ ...booking, purpose: 'New purpose' });
      expect(updated.user_id).toBe(user.id);
      expect(updated.equipment_id).toBe(equipment.id);
    });

    it.each(['cancelled', 'completed'])('updates the status to %s', async (status) => {
      const { booking } = await setup();

      const updated = await bookingRepository.update(booking.id, { status }, client);

      expect(updated.status).toBe(status);
    });

    it('returns the booking unchanged when no valid fields are given', async () => {
      const { booking } = await setup();

      expect(await bookingRepository.update(booking.id, {}, client)).toEqual(booking);
    });

    it('returns null when the booking does not exist', async () => {
      expect(await bookingRepository.update(999999999, { purpose: 'Nothing' }, client)).toBeNull();
    });

    it.each([
      ['a status that is not allowed', { status: 'pending' }],
      ['an end time before the start time', { endAt: '2026-11-20T09:00:00Z' }]
    ])('rejects an update with %s', async (_, changes) => {
      const { booking } = await setup();

      await expect(
        bookingRepository.update(booking.id, changes, client)
      ).rejects.toMatchObject({ code: PG_CHECK_VIOLATION });
    });

    it('rejects moving a booking so that it overlaps another confirmed booking', async () => {
      const { user, equipment } = await setup(); 
      const later = await createBooking(equipment.id, user.id, {
        startAt: '2026-11-20T13:00:00Z',
        endAt: '2026-11-20T15:00:00Z'
      });

      await expect(
        bookingRepository.update(later.id, { startAt: '2026-11-20T11:00:00Z' }, client)
      ).rejects.toMatchObject({ code: PG_EXCLUSION_VIOLATION });
    });
  });

  describe('list', () => {
    let user1, user2, equipment, early, late, cancelled, otherUsersBooking;

    const book = (user, day) =>
      createBooking(equipment.id, user.id, {
        startAt: `2026-12-0${day}T10:00:00Z`,
        endAt: `2026-12-0${day}T11:00:00Z`
      }, db);

    beforeAll(async () => {
      user1 = await createUser({ fullName: 'List User One' }, db);
      user2 = await createUser({ fullName: 'List User Two' }, db);
      equipment = await createEquipment({ name: 'List Equipment' }, db);

      early = await book(user1, 1);
      cancelled = await book(user1, 2);
      late = await book(user1, 3);
      otherUsersBooking = await book(user2, 4);
      cancelled = await bookingRepository.update(cancelled.id, { status: 'cancelled' }, db);
    });

    afterAll(async () => {
      await db.query('DELETE FROM bookings WHERE equipment_id = $1', [equipment.id]);
      await db.query('DELETE FROM equipment WHERE id = $1', [equipment.id]);
      await db.query('DELETE FROM users WHERE id = ANY($1::bigint[])', [[user1.id, user2.id]]);
    });

    it("returns only the given user's bookings, newest first", async () => {
      const rows = await bookingRepository.list({ userId: user1.id });

      expect(rows.map(r => r.id)).toEqual([late.id, cancelled.id, early.id]);
    });

    it('includes the equipment code, equipment name and who booked it', async () => {
      const rows = await bookingRepository.list({ userId: user2.id });

      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        id: otherUsersBooking.id,
        equipment_code: equipment.equipment_code,
        equipment_name: 'List Equipment',
        booked_by: 'List User Two'
      });
    });

    it('filters by status', async () => {
      const rows = await bookingRepository.list({ status: 'cancelled' });
      const ids = rows.map(r => r.id);

      expect(rows.every(r => r.status === 'cancelled')).toBe(true);
      expect(ids).toContain(cancelled.id);
      expect(ids).not.toContain(early.id);
    });

    it('filters by user and status together', async () => {
      const rows = await bookingRepository.list({ userId: user1.id, status: 'confirmed' });

      expect(rows.map(r => r.id)).toEqual([late.id, early.id]);
    });

    it('returns every booking when no filters are given', async () => {
      const ids = (await bookingRepository.list({})).map(r => r.id);

      expect(ids).toEqual(
        expect.arrayContaining([early.id, late.id, cancelled.id, otherUsersBooking.id])
      );
    });

    it('returns an empty list for a user with no bookings', async () => {
      expect(await bookingRepository.list({ userId: 999999999 })).toEqual([]);
    });
  });
});
