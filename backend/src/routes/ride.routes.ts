import { Router } from 'express';
import {
  createRide,
  getRide,
  getRideStatus,
  verifyPin,
  updateRoute,
  submitRating,
  getRatings,
} from '../controllers/ride.controller';
import { validate } from '../middleware/validate';
import { z } from 'zod';

const router = Router();

const createRideSchema = z.object({
  riderId: z.string().uuid(),
  pickupLat: z.number(),
  pickupLng: z.number(),
  pickupAddress: z.string().min(1),
  destLat: z.number(),
  destLng: z.number(),
  destAddress: z.string().min(1),
  vehicleType: z.string().default('UberX'),
});

const pinVerifySchema = z.object({
  pin: z.string().length(4),
});

const updateRouteSchema = z.object({
  destLat: z.number(),
  destLng: z.number(),
  destAddress: z.string().min(1),
});

const rateSchema = z.object({
  raterType: z.enum(['rider', 'driver']),
  rating: z.number().min(1).max(5),
});

router.post('/', validate(createRideSchema), createRide);
router.get('/:id', getRide);
router.get('/:id/status', getRideStatus);
router.post('/:id/pin/verify', validate(pinVerifySchema), verifyPin);
router.patch('/:id/route', validate(updateRouteSchema), updateRoute);
router.post('/:id/rate', validate(rateSchema), submitRating);
router.get('/:id/rating', getRatings);

export default router;
