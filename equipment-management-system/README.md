# Equipment Inventory and Maintenance Management API

A modular REST API built with Node.js, Express, PostgreSQL and CommonJS. It provides equipment inventory, booking, fault reporting, maintenance scheduling, role-based access and reporting.

## Requirements

- Node.js 20+
- Docker Desktop / Docker Engine, or PostgreSQL 14+
- npm

## Quick start

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy environment configuration:

   ```bash
   cp .env.example .env
   ```

   Set `JWT_SECRET` to a unique random value of at least 32 characters. Do not commit `.env`.

3. Start PostgreSQL:

   ```bash
   docker compose up -d
   ```

4. Create the schema and seed roles/admin:

   ```bash
   npm run migrate
   npm run seed
   ```

5. Start the API:

   ```bash
   npm run dev
   ```

6. Check `http://localhost:3000/health`.

Seeded development administrator:
- Email: `admin@example.com`
- Password: `ChangeMe123!`

Change this password immediately and do not use the seed credentials in production.

## Architecture

`routes -> middleware -> controllers -> services -> repositories -> PostgreSQL`

- **Routes:** URL and HTTP method mapping.
- **Middleware:** authentication, role checks and validation.
- **Controllers:** HTTP input/output only.
- **Services:** application rules and orchestration.
- **Repositories:** SQL and persistence.
- **Models:** lightweight entity mapping.
- **Database:** connection pool, migrations and transaction helper.

Services receive dependencies through module imports; for larger deployments, replace these with constructor-injected repository interfaces to make implementations fully swappable. The service layer is kept independent of Express request/response objects.

## Roles

| Role | Capabilities |
|---|---|
| admin | Full access, user listing, equipment deletion |
| manager | Manage equipment, faults, maintenance, reports and bookings |
| technician | View and update faults, manage maintenance, update equipment status |
| user | View equipment, create bookings, report faults and manage own bookings |

Public registration always creates a `user`; never accept a role from the public registration request.

## Authentication

Register or log in, then send the returned token:

```http
Authorization: Bearer <JWT>
```

## API reference

All routes are prefixed with `/api`.

| Method | Path | Access | Description |
|---|---|---|---|
| POST | `/auth/register` | Public | Register standard user |
| POST | `/auth/login` | Public | Login |
| GET | `/users` | Admin, manager | List users |
| GET | `/equipment` | Authenticated | List/search equipment |
| GET | `/equipment/:id` | Authenticated | Get equipment |
| GET | `/equipment/availability` | Authenticated | Equipment count by status |
| POST | `/equipment` | Admin, manager | Create equipment |
| PUT | `/equipment/:id` | Admin, manager | Update equipment |
| PATCH | `/equipment/:id/status` | Admin, manager, technician | Change equipment status |
| DELETE | `/equipment/:id` | Admin | Delete equipment |
| GET | `/bookings` | Authenticated | List bookings (users see own) |
| POST | `/bookings` | Authenticated | Create booking |
| PUT | `/bookings/:id` | Owner, admin, manager | Update booking |
| DELETE | `/bookings/:id` | Owner, admin, manager | Cancel booking |
| POST | `/faults` | Authenticated | Report fault |
| GET | `/faults` | Admin, manager, technician | List faults |
| PATCH | `/faults/:id` | Admin, manager, technician | Update fault |
| GET | `/maintenance` | Admin, manager, technician | List maintenance |
| POST | `/maintenance` | Admin, manager | Schedule maintenance |
| PATCH | `/maintenance/:id` | Admin, manager, technician | Update maintenance |
| GET | `/reports/summary` | Admin, manager | Dashboard summary |
| GET | `/reports/maintenance-activity` | Admin, manager | Maintenance counts by status |

## Example requests

### Register

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"fullName":"Alex User","email":"alex@example.com","password":"A_Strong_Password_123"}'
```

### Login

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"ChangeMe123!"}'
```

### Create equipment

```bash
curl -X POST http://localhost:3000/api/equipment \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"equipmentCode":"LAP-001","name":"Dell Laptop","description":"Engineering laptop","category":"IT","location":"Store Room A"}'
```

### Search equipment

```http
GET /api/equipment?search=laptop&status=available&location=Store&page=1&limit=20
```

### Create a booking

```json
{
  "equipmentId": 1,
  "startAt": "2027-01-10T09:00:00Z",
  "endAt": "2027-01-10T17:00:00Z",
  "purpose": "Project work"
}
```

### Report a fault

```json
{
  "equipmentId": 1,
  "description": "The display intermittently turns black.",
  "severity": "high"
}
```

### Schedule maintenance

```json
{
  "equipmentId": 1,
  "technicianId": 2,
  "maintenanceType": "Preventive inspection",
  "description": "Quarterly inspection",
  "scheduledAt": "2027-02-01T10:00:00Z"
}
```

## Booking concurrency and status notes

The database migration enables PostgreSQL `btree_gist` and adds an exclusion constraint over the equipment ID and half-open booking time range. This prevents overlapping confirmed reservations even when concurrent requests race. A conflict is returned as HTTP 409.

Equipment `status` is the current operational state, not a forecast of future bookings. A future reservation does not immediately mark equipment as `booked`. A production deployment should run a scheduled job to transition equipment into `booked` when a confirmed reservation starts and back to `available` when it ends, while respecting faults and maintenance. The API supports explicit status transitions and records manual changes.

Maintenance scheduling currently marks equipment `under_maintenance` immediately. Only schedule maintenance for equipment that should be taken out of service immediately; if future-dated maintenance must not change current status, add a maintenance-start worker.

## Error responses

All errors use:

```json
{
  "success": false,
  "message": "Human-readable error message"
}
```

Validation errors may include a `details` array. Common statuses: 400 validation, 401 unauthenticated, 403 forbidden, 404 missing resource, 409 conflict, 500 server error.

## Tests

```bash
npm test
```

The included tests cover health and unknown-route behavior. Add repository/service integration tests against a disposable PostgreSQL database before production deployment.

## Production checklist

- Use managed PostgreSQL with backups and TLS.
- Set a strong secret through a secrets manager.
- Rotate seeded credentials and remove seed access.
- Use HTTPS and a specific `CORS_ORIGIN`.
- Add account lockout / login throttling and password reset flows.
- Add audit logs for administrative changes.
- Add scheduled workers for booking start/end transitions and overdue notifications.
- Add integration tests for all permissions, status transitions and booking concurrency.
- Review retention, privacy and operational monitoring requirements.
