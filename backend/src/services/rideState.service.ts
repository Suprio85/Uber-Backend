import {
  RideStatus,
  getRideById,
  updateRideStatus,
  updateRideStartedAt,
  updateRideCompletedAt,
} from '../models/ride.model';
import { emitToRide } from './socket.service';

export type TrackingPhase = 'arrival' | 'trip' | 'completed';

/**
 * Calculate distance between two lat/lng points using Haversine formula (km).
 */
export function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371; // Earth radius in km
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;

  return parseFloat(distance.toFixed(2));
}

/**
 * Estimate duration in minutes based on distance.
 * Assumes average speed of 25 km/h (accounting for city traffic, stops, etc.).
 */
export function estimateDuration(distanceKm: number): number {
  const averageSpeedKmH = 25;
  const durationMinutes = (distanceKm / averageSpeedKmH) * 60;
  return Math.ceil(durationMinutes);
}

/**
 * Calculate ride fare deterministically based on distance and duration.
 * Formula: fare = baseFare + (distance * ratePerKm) + (duration * ratePerMinute)
 * Pricing: Base $2.00 + $1.50/km + $0.25/min
 */
export function calculateFare(pickupLat: number, pickupLng: number, destLat: number, destLng: number): number {
  const distance = calculateDistance(pickupLat, pickupLng, destLat, destLng);
  const durationMinutes = estimateDuration(distance);

  const baseFare = 2.0;
  const ratePerKm = 1.5;
  const ratePerMinute = 0.25;

  const fare = baseFare + distance * ratePerKm + durationMinutes * ratePerMinute;

  return parseFloat(fare.toFixed(2));
}

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
  let resolvedFare: number;
  
  // If no explicit fare provided, calculate from ride data
  if (finalFare !== undefined) {
    resolvedFare = finalFare;
  } else {
    const ride = await getRideById(rideId);
    if (ride) {
      // Use calculated fare to match estimated fare from creation
      resolvedFare = calculateFare(ride.pickup_lat, ride.pickup_lng, ride.dest_lat, ride.dest_lng);
    } else {
      // Fallback: use $50 minimum if ride not found
      resolvedFare = 50;
    }
  }
  
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



export async function setManualRideStatus(rideId: string, status: RideStatus): Promise<void> {
  await updateRideStatus(rideId, status);

  if (status === 'RIDE_ACTIVE') {
    await updateRideStartedAt(rideId);
  }

  if (status === 'DESTINATION_REACHED' || status === 'COMPLETED') {
    await updateRideCompletedAt(rideId, parseFloat((50 + Math.random() * 200).toFixed(2)));
  }

  await emitStatusChange(rideId, status);

  if (status === 'DRIVER_ARRIVED') {
    emitToRide(rideId, 'driver:arrived', {
      rideId,
      trackingPhase: 'arrival',
      timestamp: new Date().toISOString(),
    });
  }

  if (status === 'PIN_VERIFIED') {
    emitToRide(rideId, 'ride:pin_verified', {
      rideId,
      trackingPhase: 'trip',
      timestamp: new Date().toISOString(),
    });
  }

  if (status === 'RIDE_ACTIVE') {
    emitToRide(rideId, 'ride:started', {
      rideId,
      trackingPhase: 'trip',
      timestamp: new Date().toISOString(),
    });
  }

  if (status === 'DESTINATION_REACHED') {
    emitToRide(rideId, 'ride:completed', {
      rideId,
      totalFare: 100,
      duration: 'Demo trip',
      trackingPhase: 'completed',
      timestamp: new Date().toISOString(),
    });
  }
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