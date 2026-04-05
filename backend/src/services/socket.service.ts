import { Server, Socket } from 'socket.io';

let io: Server;

type SocketRole = 'driver' | 'rider';

const presence = new Map<string, { drivers: Set<string>; riders: Set<string> }>();


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
