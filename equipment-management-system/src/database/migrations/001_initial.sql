CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE IF NOT EXISTS roles (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(30) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  full_name VARCHAR(120) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role_id BIGINT NOT NULL REFERENCES roles(id),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS equipment (
  id BIGSERIAL PRIMARY KEY,
  equipment_code VARCHAR(60) NOT NULL UNIQUE,
  name VARCHAR(160) NOT NULL,
  description TEXT,
  category VARCHAR(100),
  location VARCHAR(160) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'available'
    CHECK (status IN ('available','booked','under_maintenance','out_of_service')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bookings (
  id BIGSERIAL PRIMARY KEY,
  equipment_id BIGINT NOT NULL REFERENCES equipment(id),
  user_id BIGINT NOT NULL REFERENCES users(id),
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'confirmed'
    CHECK (status IN ('confirmed','cancelled','completed')),
  purpose TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (end_at > start_at)
);

-- Database-level protection against concurrent overlapping active reservations.
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_no_overlap;
ALTER TABLE bookings ADD CONSTRAINT bookings_no_overlap
  EXCLUDE USING gist (
    equipment_id WITH =,
    tstzrange(start_at, end_at, '[)') WITH &&
  ) WHERE (status = 'confirmed');

CREATE TABLE IF NOT EXISTS faults (
  id BIGSERIAL PRIMARY KEY,
  equipment_id BIGINT NOT NULL REFERENCES equipment(id),
  reported_by BIGINT NOT NULL REFERENCES users(id),
  assigned_to BIGINT REFERENCES users(id),
  description TEXT NOT NULL,
  severity VARCHAR(20) NOT NULL DEFAULT 'medium'
    CHECK (severity IN ('low','medium','high','critical')),
  status VARCHAR(20) NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','in_progress','resolved','closed')),
  reported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS maintenance (
  id BIGSERIAL PRIMARY KEY,
  equipment_id BIGINT NOT NULL REFERENCES equipment(id),
  technician_id BIGINT REFERENCES users(id),
  maintenance_type VARCHAR(100) NOT NULL,
  description TEXT,
  scheduled_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  status VARCHAR(20) NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled','in_progress','completed','cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS equipment_status_history (
  id BIGSERIAL PRIMARY KEY,
  equipment_id BIGINT NOT NULL REFERENCES equipment(id),
  old_status VARCHAR(30),
  new_status VARCHAR(30) NOT NULL,
  changed_by BIGINT REFERENCES users(id),
  reason TEXT,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_equipment_search ON equipment (status, location, category);
CREATE INDEX IF NOT EXISTS idx_bookings_equipment_dates ON bookings (equipment_id, start_at, end_at);
CREATE INDEX IF NOT EXISTS idx_faults_status ON faults (status, severity);
CREATE INDEX IF NOT EXISTS idx_maintenance_schedule ON maintenance (scheduled_at, status);
