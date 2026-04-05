const { io } = require('socket.io-client');

const BASE = 'http://localhost:3000';
const OSRM = 'https://router.project-osrm.org/route/v1/driving';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function createRide() {
  const res = await fetch(`${BASE}/api/v1/rides`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      riderId: 'a0000000-0000-0000-0000-000000000001',
      pickupLat: 23.7843,
      pickupLng: 90.4075,
      pickupAddress: 'Banani, Dhaka',
      destLat: 23.753,
      destLng: 90.4015,
      destAddress: 'Motijheel, Dhaka',
      vehicleType: 'UberX',
    }),
  });
  return res.json();
}

async function verifyPin(rideId, pin) {
  const res = await fetch(`${BASE}/api/v1/rides/${rideId}/pin/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin }),
  });
  return res.json();
}

async function submitRating(rideId) {
  const res = await fetch(`${BASE}/api/v1/rides/${rideId}/rate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ raterType: 'rider', rating: 5 }),
  });
  return res.json();
}

async function getRide(rideId) {
  const res = await fetch(`${BASE}/api/v1/rides/${rideId}`);
  return res.json();
}

function calculateHeading(lat1, lng1, lat2, lng2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const toDeg = (rad) => (rad * 180) / Math.PI;
  const dLng = toRad(lng2 - lng1);
  const y = Math.sin(dLng) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLng);
  let heading = toDeg(Math.atan2(y, x));
  heading = (heading + 360) % 360;
  return Number(heading.toFixed(1));
}

function sampleCoordinates(coords, targetCount) {
  if (!coords || coords.length <= targetCount) {
    return coords;
  }

  const sampled = [];
  for (let i = 0; i < targetCount; i++) {
    const index = Math.round((i / (targetCount - 1)) * (coords.length - 1));
    sampled.push(coords[index]);
  }
  return sampled;
}

function buildTelemetryPoints(coords, trackingPhase) {
  return coords.map((coord, index) => {
    const [lng, lat] = coord;
    const next = coords[index + 1] ?? coord;
    const heading = calculateHeading(lat, lng, next[1], next[0]);
    const progress = Math.round((index / Math.max(1, coords.length - 1)) * 100);
    const remainingTicks = Math.max(0, coords.length - index - 1);
    const etaSeconds = remainingTicks * 4;
    const baseSpeed = trackingPhase === 'arrival' ? 18 + index * 5 : 22 + index * 4;

    return {
      lat: Number(lat.toFixed(6)),
      lng: Number(lng.toFixed(6)),
      heading,
      speed: index === coords.length - 1 ? 0 : Math.min(baseSpeed, 45),
      progress,
      eta: `${Math.max(1, Math.round(etaSeconds / 60))} min`,
      etaSeconds,
      distanceRemaining: `${Math.max(0.1, ((coords.length - index - 1) * 0.15)).toFixed(1)} km`,
      trackingPhase,
      routeSource: 'osrm',
      timestamp: new Date().toISOString(),
    };
  });
}

async function fetchOsrmRoute(startLng, startLat, endLng, endLat) {
  const url = `${OSRM}/${startLng},${startLat};${endLng},${endLat}?overview=full&geometries=geojson`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`OSRM returned ${res.status}`);
  }
  const data = await res.json();
  const coords = data?.routes?.[0]?.geometry?.coordinates;
  if (!coords || coords.length < 2) {
    throw new Error('OSRM returned insufficient coordinates');
  }
  return coords;
}

async function main() {
  console.log('=== WebSocket OSRM Payload Flow Test ===');

  const created = await createRide();
  const rideId = created.rideId;
  const pin = created.pin;

  const driverSocket = io(BASE, { transports: ['websocket'] });
  const riderSocket = io(BASE, { transports: ['websocket'] });

  const riderEvents = {
    driverLocations: [],
    progress: [],
    arrived: [],
    started: [],
    completed: [],
    errors: [],
  };
  const driverEvents = {
    riderLocations: [],
    routeUpdated: [],
    errors: [],
  };

  riderSocket.on('connect', () => riderSocket.emit('rider:join', { rideId }));
  driverSocket.on('connect', () => driverSocket.emit('driver:join', { rideId }));

  riderSocket.on('driver:location', (data) => riderEvents.driverLocations.push(data));
  riderSocket.on('ride:progress', (data) => riderEvents.progress.push(data));
  riderSocket.on('driver:arrived', (data) => riderEvents.arrived.push(data));
  riderSocket.on('ride:started', (data) => riderEvents.started.push(data));
  riderSocket.on('ride:completed', (data) => riderEvents.completed.push(data));
  riderSocket.on('socket:error', (data) => riderEvents.errors.push(data));

  driverSocket.on('rider:location', (data) => driverEvents.riderLocations.push(data));
  driverSocket.on('route:updated', (data) => driverEvents.routeUpdated.push(data));
  driverSocket.on('socket:error', (data) => driverEvents.errors.push(data));

  await sleep(1000);

  const approachRouteRaw = await fetchOsrmRoute(90.4125, 23.8103, 90.4075, 23.7843);
  const tripRouteRaw = await fetchOsrmRoute(90.4075, 23.7843, 90.4015, 23.7530);

  const approachPoints = buildTelemetryPoints(sampleCoordinates(approachRouteRaw, 5), 'arrival');
  const tripDriverPoints = buildTelemetryPoints(sampleCoordinates(tripRouteRaw, 5), 'trip');
  const tripRiderPoints = buildTelemetryPoints(sampleCoordinates(tripRouteRaw, 3), 'trip');

  driverSocket.emit('driver:heading_to_pickup', { rideId });
  await sleep(300);

  for (const point of approachPoints) {
    driverSocket.emit('driver:location:update', { rideId, ...point });
    await sleep(220);
  }

  driverSocket.emit('driver:arrived_at_pickup', { rideId });
  await sleep(300);

  await verifyPin(rideId, pin);
  await sleep(300);

  driverSocket.emit('driver:start_ride', { rideId });
  await sleep(300);

  for (const point of tripDriverPoints) {
    driverSocket.emit('driver:location:update', { rideId, ...point });
    await sleep(220);
  }

  for (const point of tripRiderPoints) {
    riderSocket.emit('rider:location:update', { rideId, ...point });
    await sleep(220);
  }

  const routeUpdateRes = await fetch(`${BASE}/api/v1/rides/${rideId}/route`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ destLat: 23.77, destLng: 90.39, destAddress: 'Gulshan, Dhaka' }),
  });
  await routeUpdateRes.json();
  await sleep(300);

  driverSocket.emit('driver:complete_ride', {
    rideId,
    finalFare: 144.4,
    duration: 'OSRM trip',
  });
  await sleep(400);

  await submitRating(rideId);
  await sleep(250);

  const ride = await getRide(rideId);

  let pass = 0;
  let fail = 0;
  function assert(condition, name) {
    if (condition) {
      console.log(`PASS: ${name}`);
      pass++;
    } else {
      console.log(`FAIL: ${name}`);
      fail++;
    }
  }

  assert(approachRouteRaw.length > 2, 'OSRM returned approach route geometry');
  assert(tripRouteRaw.length > 2, 'OSRM returned trip route geometry');
  assert(riderEvents.driverLocations.length === 10, `rider received OSRM-based driver updates (got ${riderEvents.driverLocations.length})`);
  assert(riderEvents.progress.length === 10, `ride progress emitted from OSRM-based driver updates (got ${riderEvents.progress.length})`);
  assert(driverEvents.riderLocations.length === 3, `driver received rider trip updates (got ${driverEvents.riderLocations.length})`);
  assert(riderEvents.arrived.length === 1, 'driver arrival event emitted');
  assert(riderEvents.started.length >= 1, 'ride started event emitted');
  assert(driverEvents.routeUpdated.length >= 1, 'route update still works after OSRM-based flow');
  assert(riderEvents.completed.length >= 1, 'ride completed event emitted');
  assert(ride.latestDriverLocation !== null, 'latest driver location stored from OSRM-based payloads');
  assert(ride.latestRiderLocation !== null, 'latest rider location stored from OSRM-based payloads');
  assert(ride.status === 'COMPLETED', 'ride reaches COMPLETED after OSRM-based flow');
  assert(riderEvents.errors.length === 0, 'rider socket had no errors');
  assert(driverEvents.errors.length === 0, 'driver socket had no errors');

  console.log(`\nResult: ${pass}/${pass + fail} passed`);

  driverSocket.disconnect();
  riderSocket.disconnect();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
