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