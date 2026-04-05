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
  created_at: Date;
  updated_at: Date;
  driver_name?: string;
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
