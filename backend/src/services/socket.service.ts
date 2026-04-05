import { Server, Socket } from 'socket.io';

let io: Server;

const presence = new Map<string, { drivers: Set<string>; riders: Set<string> }>();


function ensurePresence(rideId: string): { drivers: Set<string>; riders: Set<string> } {
  let record = presence.get(rideId);
  if (!record) {
    record = { drivers: new Set<string>(), riders: new Set<string>() };
    presence.set(rideId, record);
  }
  return record;
}

function getRideRoom(rideId: string): string {
  return `ride:${rideId}`;
}


export function emitToRide(rideId: string, event: string, data: unknown): void {
  if (io) {
    io.to(getRideRoom(rideId)).emit(event, data);
  }
}