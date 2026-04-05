import { Router, Request, Response, NextFunction } from 'express';
import * as RideModel from '../models/ride.model';
import { emitToRide, getRidePresence } from '../services/socket.service';
import {
  completeRide,
  getTrackingPhase,
  markDriverArrived,
  markDriverHeadingToPickup,
  markPinVerified,
  setManualRideStatus,
  startRide,
} from '../services/rideState.service';

const router = Router();

router.get('/rides/pending', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const ride = await RideModel.findPendingRide();
      if (!ride) {
        res.status(404).json({ error: 'No pending rides' });
        return;
      }
  
      const latestLocations = await RideModel.getLatestLocations(ride.id);
      const presence = getRidePresence(ride.id);
  
      res.json({
        ...ride,
        trackingPhase: getTrackingPhase(ride.status),
        latestDriverLocation: latestLocations.driverLocation,
        latestRiderLocation: latestLocations.riderLocation,
        connections: presence,
      });
    } catch (error) {
      next(error);
    }
});

router.get('/rides/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = req.params.id as string;
      const ride = await RideModel.getRideById(id);
      if (!ride) {
        res.status(404).json({ error: 'Ride not found' });
        return;
      }
  
      const latestLocations = await RideModel.getLatestLocations(id);
      const presence = getRidePresence(id);
  
      res.json({
        ...ride,
        trackingPhase: getTrackingPhase(ride.status),
        latestDriverLocation: latestLocations.driverLocation,
        latestRiderLocation: latestLocations.riderLocation,
        connections: presence,
      });
    } catch (error) {
      next(error);
    }
});

router.post('/rides/:id/advance', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = req.params.id as string;
      const ride = await RideModel.getRideById(id);
      if (!ride) {
        res.status(404).json({ error: 'Ride not found' });
        return;
      }
  
      const nextMap: Partial<Record<RideModel.RideStatus, RideModel.RideStatus>> = {
        DRIVER_ASSIGNED: 'DRIVER_EN_ROUTE',
        DRIVER_EN_ROUTE: 'DRIVER_ARRIVED',
        DRIVER_ARRIVED: 'PIN_VERIFIED',
        PIN_VERIFIED: 'RIDE_ACTIVE',
        RIDE_ACTIVE: 'DESTINATION_REACHED',
        DESTINATION_REACHED: 'COMPLETED',
      };
  
      const nextStatus = nextMap[ride.status];
      if (!nextStatus) {
        res.json({ message: 'Ride already at terminal or unsupported status', status: ride.status });
        return;
      }
  
      await applyDriverAction(id, nextStatus);
      res.json({ success: true, previousStatus: ride.status, newStatus: nextStatus });
    } catch (error) {
      next(error);
    }
});

router.post('/rides/:id/set-status', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = req.params.id as string;
      const { status } = req.body as { status?: RideModel.RideStatus };
      const validStatuses: RideModel.RideStatus[] = [
        'REQUESTED',
        'DRIVER_ASSIGNED',
        'DRIVER_EN_ROUTE',
        'DRIVER_ARRIVED',
        'PIN_VERIFIED',
        'RIDE_ACTIVE',
        'DESTINATION_REACHED',
        'RATING',
        'COMPLETED',
        'CANCELLED',
      ];
  
      if (!status || !validStatuses.includes(status)) {
        res.status(400).json({ error: 'Invalid status', valid: validStatuses });
        return;
      }
  
      const ride = await RideModel.getRideById(id);
      if (!ride) {
        res.status(404).json({ error: 'Ride not found' });
        return;
      }
  
      await setManualRideStatus(id, status);
      res.json({ success: true, status });
    } catch (error) {
      next(error);
    }
});

router.post('/rides/:id/verify-pin', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = req.params.id as string;
      const ride = await RideModel.getRideById(id);
      if (!ride) {
        res.status(404).json({ error: 'Ride not found' });
        return;
      }
  
      if (ride.status !== 'DRIVER_ARRIVED') {
        res.status(409).json({ error: 'PIN can only be verified after driver arrival' });
        return;
      }
  
      const { pin } = req.body as { pin?: string };
      if (!pin) {
        res.status(400).json({ error: 'PIN is required' });
        return;
      }
  
      const isValid = await RideModel.verifyPin(id, pin);
      if (!isValid) {
        res.status(400).json({ error: 'Invalid PIN' });
        return;
      }
  
      await markPinVerified(id);
      res.json({ success: true, status: 'PIN_VERIFIED' });
    } catch (error) {
      next(error);
    }
});

router.get('/rides/:id/locations', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = req.params.id as string;
      const [driverLocations, riderLocations] = await Promise.all([
        RideModel.getLocationLogs(id, 'driver', 20),
        RideModel.getLocationLogs(id, 'rider', 20),
      ]);
  
      res.json({
        rideId: id,
        driverLocations,
        riderLocations,
      });
    } catch (error) {
      next(error);
    }
});

router.post('/rides/:id/notify', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = req.params.id as string;
      const { event, payload } = req.body as { event?: string; payload?: unknown };
      if (!event) {
        res.status(400).json({ error: 'event is required' });
        return;
      }
      emitToRide(id, event, payload ?? { rideId: id, timestamp: new Date().toISOString() });
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
});

async function applyDriverAction(rideId: string, status: RideModel.RideStatus): Promise<void> {
    switch (status) {
      case 'DRIVER_EN_ROUTE':
        await markDriverHeadingToPickup(rideId);
        break;
      case 'DRIVER_ARRIVED':
        await markDriverArrived(rideId);
        break;
      case 'PIN_VERIFIED':
        await markPinVerified(rideId);
        break;
      case 'RIDE_ACTIVE':
        await startRide(rideId);
        break;
      case 'DESTINATION_REACHED':
        await completeRide(rideId);
        break;
      default:
        await setManualRideStatus(rideId, status);
        break;
    }
  }
  
  export default router;