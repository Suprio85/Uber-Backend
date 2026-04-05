import {
  assertTransitionAllowed,
  canTransition,
  completeRide,
  getTrackingPhase,
  markDriverArrived,
  markDriverHeadingToPickup,
  markPinVerified,
  startRide,
} from '../services/rideState.service';
import {
  getRideById,
  updateRideCompletedAt,
  updateRideStartedAt,
  updateRideStatus,
} from '../models/ride.model';
import { emitToRide } from '../services/socket.service';

jest.mock('../models/ride.model', () => ({
  getRideById: jest.fn(),
  updateRideStatus: jest.fn(),
  updateRideStartedAt: jest.fn(),
  updateRideCompletedAt: jest.fn(),
}));

jest.mock('../services/socket.service', () => ({
  emitToRide: jest.fn(),
}));

const mockedGetRideById = getRideById as jest.MockedFunction<typeof getRideById>;
const mockedUpdateRideStatus = updateRideStatus as jest.MockedFunction<typeof updateRideStatus>;
const mockedUpdateRideStartedAt = updateRideStartedAt as jest.MockedFunction<typeof updateRideStartedAt>;
const mockedUpdateRideCompletedAt = updateRideCompletedAt as jest.MockedFunction<typeof updateRideCompletedAt>;
const mockedEmitToRide = emitToRide as jest.MockedFunction<typeof emitToRide>;

describe('ride state service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedUpdateRideStatus.mockResolvedValue(null);
    mockedUpdateRideStartedAt.mockResolvedValue();
    mockedUpdateRideCompletedAt.mockResolvedValue(null);
  });

  it('maps statuses to tracking phases', () => {
    expect(getTrackingPhase('REQUESTED')).toBe('arrival');
    expect(getTrackingPhase('DRIVER_EN_ROUTE')).toBe('arrival');
    expect(getTrackingPhase('PIN_VERIFIED')).toBe('trip');
    expect(getTrackingPhase('RIDE_ACTIVE')).toBe('trip');
    expect(getTrackingPhase('DESTINATION_REACHED')).toBe('completed');
    expect(getTrackingPhase('COMPLETED')).toBe('completed');
  });

  it('validates allowed transitions', () => {
    expect(canTransition('REQUESTED', 'DRIVER_ASSIGNED')).toBe(true);
    expect(canTransition('REQUESTED', 'RIDE_ACTIVE')).toBe(false);
    expect(canTransition('RIDE_ACTIVE', 'DESTINATION_REACHED')).toBe(true);
    expect(canTransition('COMPLETED', 'RIDE_ACTIVE')).toBe(false);
  });

  it('starts ride and emits state events', async () => {
    await startRide('ride-1');

    expect(mockedUpdateRideStatus).toHaveBeenCalledWith('ride-1', 'RIDE_ACTIVE');
    expect(mockedUpdateRideStartedAt).toHaveBeenCalledWith('ride-1');
    expect(mockedEmitToRide).toHaveBeenCalledWith(
      'ride-1',
      'ride:status_changed',
      expect.objectContaining({ rideId: 'ride-1', status: 'RIDE_ACTIVE', trackingPhase: 'trip' })
    );
    expect(mockedEmitToRide).toHaveBeenCalledWith(
      'ride-1',
      'ride:started',
      expect.objectContaining({ rideId: 'ride-1', trackingPhase: 'trip' })
    );
  });

  it('completes ride with explicit fare and emits completion', async () => {
    await completeRide('ride-2', 123.45, '10 min');

    expect(mockedUpdateRideStatus).toHaveBeenCalledWith('ride-2', 'DESTINATION_REACHED');
    expect(mockedUpdateRideCompletedAt).toHaveBeenCalledWith('ride-2', 123.45);
    expect(mockedEmitToRide).toHaveBeenCalledWith(
      'ride-2',
      'ride:completed',
      expect.objectContaining({ rideId: 'ride-2', totalFare: 123.45, duration: '10 min' })
    );
  });

  it('marks heading, arrival and pin verification status changes', async () => {
    await markDriverHeadingToPickup('ride-3');
    await markDriverArrived('ride-3');
    await markPinVerified('ride-3');

    expect(mockedUpdateRideStatus).toHaveBeenCalledWith('ride-3', 'DRIVER_EN_ROUTE');
    expect(mockedUpdateRideStatus).toHaveBeenCalledWith('ride-3', 'DRIVER_ARRIVED');
    expect(mockedUpdateRideStatus).toHaveBeenCalledWith('ride-3', 'PIN_VERIFIED');
  });

  it('rejects transition for missing ride', async () => {
    mockedGetRideById.mockResolvedValueOnce(null);

    const result = await assertTransitionAllowed('unknown-ride', 'RIDE_ACTIVE');

    expect(result).toEqual({ ok: false, reason: 'Ride not found' });
  });

  it('rejects invalid transition and accepts valid transition', async () => {
    mockedGetRideById.mockResolvedValueOnce({ status: 'REQUESTED' } as never);

    const invalid = await assertTransitionAllowed('ride-4', 'RIDE_ACTIVE');
    expect(invalid).toEqual({
      ok: false,
      reason: 'Invalid ride transition from REQUESTED to RIDE_ACTIVE',
    });

    mockedGetRideById.mockResolvedValueOnce({ status: 'DRIVER_ARRIVED' } as never);
    const valid = await assertTransitionAllowed('ride-4', 'PIN_VERIFIED');
    expect(valid).toEqual({ ok: true });
  });
});
