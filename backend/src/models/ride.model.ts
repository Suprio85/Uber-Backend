import pool from '../db/pool';

export type RideStatus =
  | 'REQUESTED'
  | 'DRIVER_ASSIGNED'
  | 'DRIVER_EN_ROUTE'
  | 'DRIVER_ARRIVED'
  | 'PIN_VERIFIED'
  | 'RIDE_ACTIVE'
  | 'DESTINATION_REACHED'
  | 'RATING'
  | 'COMPLETED'
  | 'CANCELLED';

export type LocationActor = 'driver' | 'rider';

export interface Ride {
  id: string;
  rider_id: string;
  driver_id: string | null;
  status: RideStatus;
  pickup_lat: number;
  pickup_lng: number;
  pickup_address: string;
  dest_lat: number;
  dest_lng: number;
  dest_address: string;
  estimated_fare: number;
  final_fare: number | null;
  pin: string | null;
  vehicle_type: string;
  started_at: Date | null;
  completed_at: Date | null;
  rider_rating: number | null;
  driver_rating: number | null;
  created_at: Date;
  updated_at: Date;
  driver_name?: string;
  driver_phone?: string;
  driver_vehicle?: string;
  driver_license_plate?: string;
  driver_avg_rating?: number;
}

export interface RideLocation {
  actor_type: LocationActor;
  lat: number;
  lng: number;
  heading: number;
  speed: number;
  recorded_at: Date;
}

export interface CreateRideInput {
  riderId: string;
  pickupLat: number;
  pickupLng: number;
  pickupAddress: string;
  destLat: number;
  destLng: number;
  destAddress: string;
  vehicleType: string;
}

export async function createRide(
  input: CreateRideInput,
  driverId: string,
  pin: string,
  estimatedFare: number
): Promise<Ride> {
  const result = await pool.query(
    `INSERT INTO rides (rider_id, driver_id, pickup_lat, pickup_lng, pickup_address, dest_lat, dest_lng, dest_address, vehicle_type, estimated_fare, pin, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'DRIVER_ASSIGNED')
     RETURNING *`,
    [
      input.riderId,
      driverId,
      input.pickupLat,
      input.pickupLng,
      input.pickupAddress,
      input.destLat,
      input.destLng,
      input.destAddress,
      input.vehicleType,
      estimatedFare,
      pin,
    ]
  );
  return result.rows[0];
}

export async function getRideById(id: string): Promise<Ride | null> {
  const result = await pool.query(
    `SELECT r.*, d.name AS driver_name, d.phone AS driver_phone, d.vehicle AS driver_vehicle,
            d.license_plate AS driver_license_plate, d.rating AS driver_avg_rating
     FROM rides r
     LEFT JOIN drivers d ON r.driver_id = d.id
     WHERE r.id = $1`,
    [id]
  );
  return result.rows[0] ?? null;
}

export async function getRideStatus(id: string): Promise<{ status: RideStatus; updated_at: Date } | null> {
  const result = await pool.query('SELECT status, updated_at FROM rides WHERE id = $1', [id]);
  return result.rows[0] ?? null;
}

export async function updateRideStatus(id: string, status: RideStatus): Promise<Ride | null> {
  const result = await pool.query(
    'UPDATE rides SET status = $1, updated_at = now() WHERE id = $2 RETURNING *',
    [status, id]
  );
  return result.rows[0] ?? null;
}

export async function updateRideStartedAt(id: string): Promise<void> {
  await pool.query('UPDATE rides SET started_at = now(), updated_at = now() WHERE id = $1', [id]);
}

export async function updateRideCompletedAt(id: string, finalFare: number): Promise<Ride | null> {
  const result = await pool.query(
    'UPDATE rides SET completed_at = now(), final_fare = $1, updated_at = now() WHERE id = $2 RETURNING *',
    [finalFare, id]
  );
  return result.rows[0] ?? null;
}

export async function updateRideDestination(
  id: string,
  destLat: number,
  destLng: number,
  destAddress: string,
  newFare: number
): Promise<Ride | null> {
  const result = await pool.query(
    `UPDATE rides
     SET dest_lat = $1, dest_lng = $2, dest_address = $3, estimated_fare = $4, updated_at = now()
     WHERE id = $5
     RETURNING *`,
    [destLat, destLng, destAddress, newFare, id]
  );
  return result.rows[0] ?? null;
}

export async function verifyPin(rideId: string, pin: string): Promise<boolean> {
  const result = await pool.query('SELECT pin FROM rides WHERE id = $1', [rideId]);
  const ride = result.rows[0];
  if (!ride) return false;
  return ride.pin === pin;
}

export async function updateRidePinVerified(id: string): Promise<Ride | null> {
  const result = await pool.query(
    "UPDATE rides SET status = 'PIN_VERIFIED', updated_at = now() WHERE id = $1 RETURNING *",
    [id]
  );
  return result.rows[0] ?? null;
}


export async function insertLocationLog(
  rideId: string,
  actorType: LocationActor,
  lat: number,
  lng: number,
  heading: number,
  speed: number
): Promise<void> {
  await pool.query(
    'INSERT INTO location_logs (ride_id, actor_type, lat, lng, heading, speed) VALUES ($1, $2, $3, $4, $5, $6)',
    [rideId, actorType, lat, lng, heading, speed]
  );
}

export async function getLatestLocation(
  rideId: string,
  actorType: LocationActor
): Promise<RideLocation | null> {
  const result = await pool.query(
    `SELECT actor_type, lat, lng, heading, speed, recorded_at
     FROM location_logs
     WHERE ride_id = $1 AND actor_type = $2
     ORDER BY recorded_at DESC
     LIMIT 1`,
    [rideId, actorType]
  );
  return result.rows[0] ?? null;
}

export async function getLatestLocations(rideId: string): Promise<{
  driverLocation: RideLocation | null;
  riderLocation: RideLocation | null;
}> {
  const [driverLocation, riderLocation] = await Promise.all([
    getLatestLocation(rideId, 'driver'),
    getLatestLocation(rideId, 'rider'),
  ]);

  return { driverLocation, riderLocation };
}

export async function findPendingRide(): Promise<Ride | null> {
  const result = await pool.query(
    `SELECT r.*, d.name AS driver_name, d.phone AS driver_phone, d.vehicle AS driver_vehicle,
            d.license_plate AS driver_license_plate, d.rating AS driver_avg_rating
     FROM rides r
     LEFT JOIN drivers d ON r.driver_id = d.id
     WHERE r.status IN ('REQUESTED', 'DRIVER_ASSIGNED')
     ORDER BY r.created_at DESC
     LIMIT 1`
  );
  return result.rows[0] ?? null;
}
