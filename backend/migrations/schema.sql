DO $$ BEGIN
  CREATE TYPE ride_status AS ENUM (
    'REQUESTED',
    'DRIVER_ASSIGNED',
    'DRIVER_EN_ROUTE',
    'DRIVER_ARRIVED',
    'PIN_VERIFIED',
    'RIDE_ACTIVE',
    'DESTINATION_REACHED',
    'RATING',
    'COMPLETED',
    'CANCELLED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Table: riders
CREATE TABLE IF NOT EXISTS riders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  rating DECIMAL(2,1) NOT NULL DEFAULT 5.0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Table: drivers
CREATE TABLE IF NOT EXISTS drivers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  vehicle VARCHAR(100) NOT NULL,
  license_plate VARCHAR(20) NOT NULL,
  rating DECIMAL(2,1) NOT NULL DEFAULT 4.9,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Table: rides
CREATE TABLE IF NOT EXISTS rides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id UUID NOT NULL REFERENCES riders(id),
  driver_id UUID REFERENCES drivers(id),
  status ride_status NOT NULL DEFAULT 'REQUESTED',
  pickup_lat DECIMAL(9,6) NOT NULL,
  pickup_lng DECIMAL(9,6) NOT NULL,
  pickup_address TEXT NOT NULL,
  dest_lat DECIMAL(9,6) NOT NULL,
  dest_lng DECIMAL(9,6) NOT NULL,
  dest_address TEXT NOT NULL,
  estimated_fare DECIMAL(8,2) NOT NULL,
  final_fare DECIMAL(8,2),
  pin CHAR(4),
  vehicle_type VARCHAR(20) NOT NULL DEFAULT 'UberX',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  rider_rating DECIMAL(2,1),
  driver_rating DECIMAL(2,1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Table: location_logs
CREATE TABLE IF NOT EXISTS location_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id UUID NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  actor_type VARCHAR(10) NOT NULL DEFAULT 'driver',
  lat DECIMAL(9,6) NOT NULL,
  lng DECIMAL(9,6) NOT NULL,
  heading DECIMAL(5,2) NOT NULL DEFAULT 0,
  speed DECIMAL(5,2) NOT NULL DEFAULT 0,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE location_logs
  ADD COLUMN IF NOT EXISTS actor_type VARCHAR(10) NOT NULL DEFAULT 'driver';

CREATE INDEX IF NOT EXISTS idx_location_logs_ride_actor_recorded_at
  ON location_logs (ride_id, actor_type, recorded_at DESC);

-- Seed demo rider
INSERT INTO riders (id, name, phone, rating)
VALUES ('a0000000-0000-0000-0000-000000000001', 'Demo Rider', '+8801700000001', 5.0)
ON CONFLICT (id) DO NOTHING;

-- Seed demo driver
INSERT INTO drivers (id, name, phone, vehicle, license_plate, rating)
VALUES (
  'b0000000-0000-0000-0000-000000000001',
  'Demo Driver',
  '+8801700000002',
  'Toyota Prius · White',
  'GA-12-3456',
  4.9
)
ON CONFLICT (id) DO NOTHING;
