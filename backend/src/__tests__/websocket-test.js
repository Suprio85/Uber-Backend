const { io } = require('socket.io-client');

const BASE = 'http://localhost:3000';

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

async function getRide(rideId) {
  const res = await fetch(`${BASE}/api/v1/rides/${rideId}`);
  return res.json();
}

async function getRideStatus(rideId) {
  const res = await fetch(`${BASE}/api/v1/rides/${rideId}/status`);
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

async function updateRoute(rideId) {
  const res = await fetch(`${BASE}/api/v1/rides/${rideId}/route`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      destLat: 23.77,
      destLng: 90.39,
      destAddress: 'Gulshan, Dhaka',
    }),
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

async function main() {
  console.log('=== Socket Relay Flow Test ===');
  const created = await createRide();
  const rideId = created.rideId;
  const pin = created.pin;
  console.log(`Ride created: ${rideId} | PIN: ${pin}`);

  const driverSocket = io(BASE, { transports: ['websocket'] });
  const riderSocket = io(BASE, { transports: ['websocket'] });

  const driverEvents = {
    joined: [],
    presence: [],
    riderLocations: [],
    status: [],
    routeUpdated: [],
    started: [],
    completed: [],
    errors: [],
  };

  const riderEvents = {
    joined: [],
    presence: [],
    driverLocations: [],
    status: [],
    progress: [],
    arrived: [],
    pinVerified: [],
    routeUpdated: [],
    started: [],
    completed: [],
    errors: [],
  };

  const wireCommon = (socket, store, role) => {
    socket.on('ride:joined', (data) => store.joined.push(data));
    socket.on('ride:presence', (data) => store.presence.push(data));
    socket.on('ride:status_changed', (data) => store.status.push(data));
    socket.on('ride:started', (data) => store.started.push(data));
    socket.on('ride:completed', (data) => store.completed.push(data));
    socket.on('route:updated', (data) => store.routeUpdated.push(data));
    socket.on('socket:error', (data) => store.errors.push(data));
    socket.on('connect', () => {
      socket.emit(`${role}:join`, { rideId });
    });
  };

  wireCommon(driverSocket, driverEvents, 'driver');
  wireCommon(riderSocket, riderEvents, 'rider');
  riderSocket.on('driver:location', (data) => riderEvents.driverLocations.push(data));
  riderSocket.on('ride:progress', (data) => riderEvents.progress.push(data));
  riderSocket.on('driver:arrived', (data) => riderEvents.arrived.push(data));
  riderSocket.on('ride:pin_verified', (data) => riderEvents.pinVerified.push(data));
  driverSocket.on('rider:location', (data) => driverEvents.riderLocations.push(data));

  await sleep(1000);

  driverSocket.emit('driver:heading_to_pickup', { rideId });
  await sleep(400);

  const approachPoints = [
    { lat: 23.809, lng: 90.4122, heading: 192, speed: 12, progress: 10, eta: '4 min', etaSeconds: 240, trackingPhase: 'arrival' },
    { lat: 23.8015, lng: 90.4105, heading: 190, speed: 32, progress: 45, eta: '2 min', etaSeconds: 120, trackingPhase: 'arrival' },
    { lat: 23.7922, lng: 90.4082, heading: 205, speed: 18, progress: 82, eta: '1 min', etaSeconds: 45, trackingPhase: 'arrival' },
  ];

  for (const point of approachPoints) {
    driverSocket.emit('driver:location:update', { rideId, ...point });
    await sleep(250);
  }

  driverSocket.emit('driver:arrived_at_pickup', { rideId });
  await sleep(400);

  await verifyPin(rideId, pin);
  await sleep(400);

  driverSocket.emit('driver:start_ride', { rideId });
  await sleep(400);

  const tripDriverPoints = [
    { lat: 23.7815, lng: 90.4062, heading: 205, speed: 28, progress: 12, eta: '7 min', etaSeconds: 420, distanceRemaining: '3.5 km', trackingPhase: 'trip' },
    { lat: 23.7710, lng: 90.3963, heading: 188, speed: 44, progress: 58, eta: '3 min', etaSeconds: 180, distanceRemaining: '1.4 km', trackingPhase: 'trip' },
    { lat: 23.7570, lng: 90.4015, heading: 180, speed: 16, progress: 92, eta: '1 min', etaSeconds: 30, distanceRemaining: '0.2 km', trackingPhase: 'trip' },
  ];

  const tripRiderPoints = [
    { lat: 23.7814, lng: 90.4061, heading: 204, speed: 27, progress: 12, eta: '7 min', etaSeconds: 420, trackingPhase: 'trip' },
    { lat: 23.7709, lng: 90.3962, heading: 188, speed: 43, progress: 58, eta: '3 min', etaSeconds: 180, trackingPhase: 'trip' },
  ];

  for (const point of tripDriverPoints) {
    driverSocket.emit('driver:location:update', { rideId, ...point });
    await sleep(250);
  }

  for (const point of tripRiderPoints) {
    riderSocket.emit('rider:location:update', { rideId, ...point });
    await sleep(250);
  }

  await updateRoute(rideId);
  await sleep(400);

  driverSocket.emit('driver:complete_ride', {
    rideId,
    finalFare: 132.5,
    duration: '12 min',
  });
  await sleep(500);

  await submitRating(rideId);
  await sleep(250);

  const rideHydration = await getRide(rideId);
  const rideStatus = await getRideStatus(rideId);

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

  assert(driverSocket.connected, 'driver socket connected');
  assert(riderSocket.connected, 'rider socket connected');
  assert(driverEvents.joined.length >= 1, 'driver joined ride room');
  assert(riderEvents.joined.length >= 1, 'rider joined ride room');
  assert(riderEvents.presence.some((x) => x.driverConnected && x.riderConnected), 'presence shows both clients connected');
  assert(riderEvents.driverLocations.length === 6, `rider received driver locations (got ${riderEvents.driverLocations.length})`);
  assert(driverEvents.riderLocations.length === 2, `driver received rider locations (got ${driverEvents.riderLocations.length})`);
  assert(riderEvents.progress.length === 6, `ride progress relayed to riders (got ${riderEvents.progress.length})`);
  assert(riderEvents.arrived.length === 1, 'rider received driver arrival event');
  assert(riderEvents.pinVerified.length === 1, 'rider received pin verified event');
  assert(driverEvents.started.length >= 1 && riderEvents.started.length >= 1, 'both clients received ride started event');
  assert(driverEvents.routeUpdated.length >= 1 && riderEvents.routeUpdated.length >= 1, 'route update broadcast to both clients');
  assert(driverEvents.completed.length >= 1 && riderEvents.completed.length >= 1, 'ride completed broadcast to both clients');
  assert(rideHydration.latestDriverLocation !== null, 'hydration returns latest driver location');
  assert(rideHydration.latestRiderLocation !== null, 'hydration returns latest rider location');
  assert(rideHydration.trackingPhase === 'completed', 'hydration reflects completed tracking phase');
  assert(rideStatus.status === 'COMPLETED', 'status endpoint returns COMPLETED after rating');
  assert(riderEvents.errors.length === 0, 'rider socket saw no socket errors');
  assert(driverEvents.errors.length === 0, 'driver socket saw no socket errors');

  console.log(`\nResult: ${pass}/${pass + fail} passed`);

  driverSocket.disconnect();
  riderSocket.disconnect();

  process.exit(fail > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
