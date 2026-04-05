import { Server, Socket } from 'socket.io';
import { z } from 'zod';
import { getRideById, insertLocationLog } from '../models/ride.model';
import {
  assertTransitionAllowed,
  completeRide,
  markDriverArrived,
  markDriverHeadingToPickup,
  startRide,
} from './rideState.service';

let io: Server;

type SocketRole = 'driver' | 'rider';

const presence = new Map<string, { drivers: Set<string>; riders: Set<string> }>();


const locationSchema = z.object({
  rideId: z.string().uuid(),
  lat: z.number(),
  lng: z.number(),
  heading: z.number().min(0).max(360),
  speed: z.number().min(0),
  progress: z.number().min(0).max(100).optional(),
  eta: z.string().optional(),
  etaSeconds: z.number().min(0).optional(),
  distanceRemaining: z.string().optional(),
  trackingPhase: z.enum(['arrival', 'trip', 'completed']).optional(),
  timestamp: z.string().optional(),
});


function getRideRoom(rideId: string): string {
  return `ride:${rideId}`;
}

function getRoleRoom(rideId: string, role: SocketRole): string {
  return `${getRideRoom(rideId)}:${role}s`;
}

function ensurePresence(rideId: string): { drivers: Set<string>; riders: Set<string> } {
  let record = presence.get(rideId);
  if (!record) {
    record = { drivers: new Set<string>(), riders: new Set<string>() };
    presence.set(rideId, record);
  }
  return record;
}

function removePresence(socket: Socket): void {
  const rideId = socket.data.rideId as string | undefined;
  const role = socket.data.role as SocketRole | undefined;
  if (!rideId || !role) return;

  const record = presence.get(rideId);
  if (!record) return;

  if (role === 'driver') {
    record.drivers.delete(socket.id);
  } else {
    record.riders.delete(socket.id);
  }

  if (record.drivers.size === 0 && record.riders.size === 0) {
    presence.delete(rideId);
  }
}

function emitPresence(rideId: string): void {
  const record = ensurePresence(rideId);
  io.to(getRideRoom(rideId)).emit('ride:presence', {
    rideId,
    driverConnected: record.drivers.size > 0,
    riderConnected: record.riders.size > 0,
    driverSockets: record.drivers.size,
    riderSockets: record.riders.size,
  });
}

async function joinRide(socket: Socket, rideId: string, role: SocketRole): Promise<void> {
  const ride = await getRideById(rideId);
  if (!ride) {
    socket.emit('socket:error', { error: 'Ride not found', rideId });
    return;
  }

  removePresence(socket);

  socket.join(getRideRoom(rideId));
  socket.join(getRoleRoom(rideId, role));
  socket.data.rideId = rideId;
  socket.data.role = role;

  const record = ensurePresence(rideId);
  if (role === 'driver') {
    record.drivers.add(socket.id);
  } else {
    record.riders.add(socket.id);
  }

  socket.emit('ride:joined', {
    rideId,
    role,
    status: ride.status,
  });

  emitPresence(rideId);
}

function emitToRideRole(rideId: string, role: SocketRole, event: string, data: unknown): void {
  if (io) {
    io.to(getRoleRoom(rideId, role)).emit(event, data);
  }
}

export function getIO(): Server {
  if (!io) {
    throw new Error('Socket.io not initialized');
  }
  return io;
}

export function emitToRide(rideId: string, event: string, data: unknown): void {
  if (io) {
    io.to(getRideRoom(rideId)).emit(event, data);
  }
}

export function getRidePresence(rideId: string): {
  driverConnected: boolean;
  riderConnected: boolean;
  driverSockets: number;
  riderSockets: number;
} {
  const record = ensurePresence(rideId);
  return {
    driverConnected: record.drivers.size > 0,
    riderConnected: record.riders.size > 0,
    driverSockets: record.drivers.size,
    riderSockets: record.riders.size,
  };
}


async function handleDriverLocation(socket: Socket, rawData: unknown): Promise<void> {
  if (socket.data.role !== 'driver') {
    socket.emit('socket:error', { error: 'Only driver clients can send driver location updates' });
    return;
  }
  const data = locationSchema.parse(rawData);
  const ride = await getRideById(data.rideId);
  if (!ride) {
    socket.emit('socket:error', { error: 'Ride not found', rideId: data.rideId });
    return;
  }
  if (!['DRIVER_EN_ROUTE', 'RIDE_ACTIVE'].includes(ride.status)) {
    socket.emit('socket:error', {
      error: `Driver location updates are not allowed while ride status is ${ride.status}`,
      rideId: data.rideId,
    });
    return;
  }
  await insertLocationLog(data.rideId, 'driver', data.lat, data.lng, data.heading, data.speed);
  emitToRideRole(data.rideId, 'rider', 'driver:location', {
    ...data,
    trackingPhase: data.trackingPhase ?? 'arrival',
    timestamp: data.timestamp ?? new Date().toISOString(),
  });

  if (typeof data.progress === 'number') {
    emitToRide(data.rideId, 'ride:progress', {
      rideId: data.rideId,
      progress: data.progress,
      eta: data.eta,
      etaSeconds: data.etaSeconds,
      distanceRemaining: data.distanceRemaining,
      speed: data.speed,
      trackingPhase: data.trackingPhase ?? 'arrival',
      timestamp: data.timestamp ?? new Date().toISOString(),
    });
  }
}


async function handleRiderLocation(socket: Socket, rawData: unknown): Promise<void> {
  if (socket.data.role !== 'rider') {
    socket.emit('socket:error', { error: 'Only rider clients can send rider location updates' });
    return;
  }
  const data = locationSchema.parse(rawData);
  const ride = await getRideById(data.rideId);
  if (!ride) {
    socket.emit('socket:error', { error: 'Ride not found', rideId: data.rideId });
    return;
  }
  if (ride.status !== 'RIDE_ACTIVE') {
    socket.emit('socket:error', {
      error: `Rider location updates are only allowed during an active ride. Current status: ${ride.status}`,
      rideId: data.rideId,
    });
    return;
  }
  await insertLocationLog(data.rideId, 'rider', data.lat, data.lng, data.heading, data.speed);
  emitToRideRole(data.rideId, 'driver', 'rider:location', {
    ...data,
    trackingPhase: data.trackingPhase ?? 'trip',
    timestamp: data.timestamp ?? new Date().toISOString(),
  });
}