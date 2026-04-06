import { Request, Response, NextFunction } from 'express';
import * as RideModel from '../models/ride.model';
import * as DriverModel from '../models/driver.model';
import { emitToRide } from '../services/socket.service';
import { getTrackingPhase, markPinVerified, calculateFare } from '../services/rideState.service';

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validateRideId(req: Request, res: Response): string | null {
  const id = req.params.id as string;
  if (!uuidRegex.test(id)) {
    res.status(400).json({ error: 'Invalid ride ID format' });
    return null;
  }
  return id;
}

function generatePin(): string {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

export async function createRide(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const driver = await DriverModel.getRandomDriver();
    if (!driver) {
      res.status(500).json({ error: 'No drivers available' });
      return;
    }

    const pin = generatePin();
    const estimatedFare = calculateFare(req.body.pickupLat, req.body.pickupLng, req.body.destLat, req.body.destLng);
    const ride = await RideModel.createRide(req.body, driver.id, pin, estimatedFare);

    res.status(201).json({
      rideId: ride.id,
      pin,
      status: ride.status,
      trackingPhase: getTrackingPhase(ride.status),
      driverInfo: {
        id: driver.id,
        name: driver.name,
        phone: driver.phone,
        vehicle: driver.vehicle,
        licensePlate: driver.license_plate,
        rating: driver.rating,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function getRide(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = validateRideId(req, res);
    if (!id) return;

    const ride = await RideModel.getRideById(id);
    if (!ride) {
      res.status(404).json({ error: 'Ride not found' });
      return;
    }

    const latestLocations = await RideModel.getLatestLocations(id);

    res.json({
      ...ride,
      trackingPhase: getTrackingPhase(ride.status),
      latestDriverLocation: latestLocations.driverLocation,
      latestRiderLocation: latestLocations.riderLocation,
    });
  } catch (error) {
    next(error);
  }
}

export async function getRideStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = validateRideId(req, res);
    if (!id) return;

    const status = await RideModel.getRideStatus(id);
    if (!status) {
      res.status(404).json({ error: 'Ride not found' });
      return;
    }

    res.json({
      ...status,
      trackingPhase: getTrackingPhase(status.status),
    });
  } catch (error) {
    next(error);
  }
}

export async function verifyPin(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = validateRideId(req, res);
    if (!id) return;

    const ride = await RideModel.getRideById(id);
    if (!ride) {
      res.status(404).json({ error: 'Ride not found' });
      return;
    }

    if (ride.status !== 'DRIVER_ARRIVED') {
      res.status(409).json({ error: 'PIN can only be verified after driver arrival' });
      return;
    }

    const isValid = await RideModel.verifyPin(id, req.body.pin);
    if (!isValid) {
      res.status(400).json({ error: 'Invalid PIN' });
      return;
    }

    await markPinVerified(id);

    res.json({
      success: true,
      status: 'PIN_VERIFIED',
      trackingPhase: 'trip',
    });
  } catch (error) {
    next(error);
  }
}

export async function updateRoute(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = validateRideId(req, res);
      if (!id) return;
  
      const ride = await RideModel.getRideById(id);
      if (!ride) {
        res.status(404).json({ error: 'Ride not found' });
        return;
      }
  
      if (ride.status !== 'RIDE_ACTIVE') {
        res.status(409).json({ error: 'Route can only be updated during an active ride' });
        return;
      }
  
      const { destLat, destLng, destAddress } = req.body;
      const newFare = calculateFare(ride.pickup_lat, ride.pickup_lng, destLat, destLng);
      const updatedRide = await RideModel.updateRideDestination(id, destLat, destLng, destAddress, newFare);
      if (!updatedRide) {
        res.status(404).json({ error: 'Ride not found' });
        return;
      }
  
      const payload = {
        rideId: id,
        destAddress,
        newEta: new Date(Date.now() + 15 * 60000).toISOString(),
        newFare,
        trackingPhase: 'trip',
        timestamp: new Date().toISOString(),
      };
  
      emitToRide(id, 'route:updated', payload);
      res.json(payload);
    } catch (error) {
      next(error);
    }
  }
  
  export async function submitRating(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = validateRideId(req, res);
      if (!id) return;
  
      const ride = await RideModel.getRideById(id);
      if (!ride) {
        res.status(404).json({ error: 'Ride not found' });
        return;
      }
  
      if (!['DESTINATION_REACHED', 'RATING', 'COMPLETED'].includes(ride.status)) {
        res.status(409).json({ error: 'Ride can only be rated after destination is reached' });
        return;
      }
  
      const { raterType, rating } = req.body;
      const updatedRide = await RideModel.submitRating(id, raterType, rating);
      if (!updatedRide) {
        res.status(404).json({ error: 'Ride not found' });
        return;
      }
  
      await RideModel.updateRideStatus(id, 'COMPLETED');
  
      res.json({
        success: true,
        ratings: {
          riderRating: updatedRide.rider_rating,
          driverRating: updatedRide.driver_rating,
        },
      });
    } catch (error) {
      next(error);
    }
  }
  
  export async function getRatings(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = validateRideId(req, res);
      if (!id) return;
  
      const ratings = await RideModel.getRideRatings(id);
      if (!ratings) {
        res.status(404).json({ error: 'Ride not found' });
        return;
      }
  
      res.json(ratings);
    } catch (error) {
      next(error);
    }
  }
