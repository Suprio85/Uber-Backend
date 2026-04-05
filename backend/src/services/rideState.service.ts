import {
  RideStatus,
  getRideById,
  updateRideStatus,
  updateRideStartedAt,
  updateRideCompletedAt,
} from '../models/ride.model';
import { emitToRide } from './socket.service';

export type TrackingPhase = 'arrival' | 'trip' | 'completed';

export function getTrackingPhase(status: RideStatus): TrackingPhase {
  switch (status) {
    case 'REQUESTED':
    case 'DRIVER_ASSIGNED':
    case 'DRIVER_EN_ROUTE':
    case 'DRIVER_ARRIVED':
      return 'arrival';
    case 'PIN_VERIFIED':
    case 'RIDE_ACTIVE':
      return 'trip';
    case 'DESTINATION_REACHED':
    case 'RATING':
    case 'COMPLETED':
    case 'CANCELLED':
      return 'completed';
    default:
      return 'arrival';
  }
}


const allowedRealtimeTransitions: Record<RideStatus, RideStatus[]> = {
  REQUESTED: ['DRIVER_ASSIGNED', 'CANCELLED'],
  DRIVER_ASSIGNED: ['DRIVER_EN_ROUTE', 'CANCELLED'],
  DRIVER_EN_ROUTE: ['DRIVER_ARRIVED', 'CANCELLED'],
  DRIVER_ARRIVED: ['PIN_VERIFIED', 'CANCELLED'],
  PIN_VERIFIED: ['RIDE_ACTIVE', 'CANCELLED'],
  RIDE_ACTIVE: ['DESTINATION_REACHED', 'CANCELLED'],
  DESTINATION_REACHED: ['RATING', 'COMPLETED'],
  RATING: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
};


export function canTransition(current: RideStatus, next: RideStatus): boolean {
  return allowedRealtimeTransitions[current].includes(next);
}


export async function assertTransitionAllowed(rideId: string, next: RideStatus): Promise<{ ok: true } | { ok: false; reason: string }> {
  const ride = await getRideById(rideId);
  if (!ride) {
    return { ok: false, reason: 'Ride not found' };
  }

  if (!canTransition(ride.status, next)) {
    return {
      ok: false,
      reason: `Invalid ride transition from ${ride.status} to ${next}`,
    };
  }

  return { ok: true };
}


export async function emitStatusChange(rideId: string, status: RideStatus): Promise<void> {
  emitToRide(rideId, 'ride:status_changed', {
    rideId,
    status,
    trackingPhase: getTrackingPhase(status),
    timestamp: new Date().toISOString(),
  });
}


export async function startRide(rideId: string): Promise<void> {
  await updateRideStatus(rideId, 'RIDE_ACTIVE');
  await updateRideStartedAt(rideId);
  await emitStatusChange(rideId, 'RIDE_ACTIVE');
  emitToRide(rideId, 'ride:started', {
    rideId,
    trackingPhase: 'trip',
    timestamp: new Date().toISOString(),
  });
}


export async function completeRide(
  rideId: string,
  finalFare?: number,
  duration?: string
): Promise<void> {
  const resolvedFare = finalFare ?? parseFloat((50 + Math.random() * 200).toFixed(2));
  await updateRideStatus(rideId, 'DESTINATION_REACHED');
  await updateRideCompletedAt(rideId, resolvedFare);
  await emitStatusChange(rideId, 'DESTINATION_REACHED');
  emitToRide(rideId, 'ride:completed', {
    rideId,
    totalFare: resolvedFare,
    duration: duration ?? 'Demo trip',
    trackingPhase: 'completed',
    timestamp: new Date().toISOString(),
  });
}

export async function markDriverHeadingToPickup(rideId: string): Promise<void> {
  await updateRideStatus(rideId, 'DRIVER_EN_ROUTE');
  await emitStatusChange(rideId, 'DRIVER_EN_ROUTE');
}


export async function markDriverArrived(rideId: string): Promise<void> {
  await updateRideStatus(rideId, 'DRIVER_ARRIVED');
  await emitStatusChange(rideId, 'DRIVER_ARRIVED');
  emitToRide(rideId, 'driver:arrived', {
    rideId,
    trackingPhase: 'arrival',
    timestamp: new Date().toISOString(),
  });
}


export async function markPinVerified(rideId: string): Promise<void> {
  await updateRideStatus(rideId, 'PIN_VERIFIED');
  await emitStatusChange(rideId, 'PIN_VERIFIED');
  emitToRide(rideId, 'ride:pin_verified', {
    rideId,
    trackingPhase: 'trip',
    timestamp: new Date().toISOString(),
  });
}
