import { calculateFare, calculateDistance, estimateDuration } from '../services/rideState.service';

describe('Pricing Consistency Throughout Ride Lifecycle', () => {
  
  describe('Deterministic Pricing Formula', () => {
    it('should calculate same fare for same coordinates across multiple calls', () => {
      const lat1 = 23.7843, lng1 = 90.4075; // Banani
      const lat2 = 23.753,  lng2 = 90.4015; // Motijheel
      
      const fare1 = calculateFare(lat1, lng1, lat2, lng2);
      const fare2 = calculateFare(lat1, lng1, lat2, lng2);
      const fare3 = calculateFare(lat1, lng1, lat2, lng2);
      
      expect(fare1).toEqual(fare2);
      expect(fare2).toEqual(fare3);
      expect(fare1).toBeGreaterThan(0);
    });

    it('should have consistent distance calculation', () => {
      const lat1 = 23.7843, lng1 = 90.4075;
      const lat2 = 23.753,  lng2 = 90.4015;
      
      const dist1 = calculateDistance(lat1, lng1, lat2, lng2);
      const dist2 = calculateDistance(lat1, lng1, lat2, lng2);
      
      expect(dist1).toEqual(dist2);
      expect(dist1).toBeLessThan(10); // Should be less than 10km
      expect(dist1).toBeGreaterThan(0);
    });

    it('should have consistent duration estimation', () => {
      const distanceKm = 5;
      const dur1 = estimateDuration(distanceKm);
      const dur2 = estimateDuration(distanceKm);
      
      expect(dur1).toEqual(dur2);
      expect(dur1).toBeGreaterThan(0);
    });
  });

  describe('Pricing for Different Routes', () => {
    it('should calculate proportionally higher fare for longer distances', () => {
      const lat1 = 23.7843, lng1 = 90.4075; // Banani
      const latMotijheel = 23.753,  lngMotijheel = 90.4015; // ~6km
      const latGulshan = 23.78,     lngGulshan = 90.42;     // ~3km
      
      const fareMotijheel = calculateFare(lat1, lng1, latMotijheel, lngMotijheel);
      const fareGulshan = calculateFare(lat1, lng1, latGulshan, lngGulshan);
      
      // Motijheel is farther, so fare should be higher
      expect(fareMotijheel).toBeGreaterThan(fareGulshan);
    });

    it('should have minimum fare of at least base price ($2)', () => {
      const lat1 = 23.7843, lng1 = 90.4075;
      const lat2 = 23.7844, lng2 = 90.4076; // Very close, ~10m
      
      const fare = calculateFare(lat1, lng1, lat2, lng2);
      expect(fare).toBeGreaterThanOrEqual(2); // Minimum base price
    });
  });

  describe('Price Consistency at Key Lifecycle Points', () => {
    it('should maintain same price when recalculating for same destination', () => {
      // Simulating: ride created → no route change → ride completed
      const pickupLat = 23.7843, pickupLng = 90.4075;
      const destLat = 23.753,    destLng = 90.4015;
      
      // Price at creation
      const estimatedFare = calculateFare(pickupLat, pickupLng, destLat, destLng);
      
      // Price after some time (no route change)
      const finalFare = calculateFare(pickupLat, pickupLng, destLat, destLng);
      
      // Should be identical (deterministic formula)
      expect(estimatedFare).toEqual(finalFare);
    });

    it('should update price correctly when destination changes mid-ride', () => {
      const pickupLat = 23.7843, pickupLng = 90.4075;
      const oldDestLat = 23.753,  oldDestLng = 90.4015;
      const newDestLat = 23.78,   newDestLng = 90.42;
      
      // Price for original destination
      const originalFare = calculateFare(pickupLat, pickupLng, oldDestLat, oldDestLng);
      
      // Price when destination changes
      const updatedFare = calculateFare(pickupLat, pickupLng, newDestLat, newDestLng);
      
      // Prices should be different (different destinations)
      // This verifies the fare calculation is sensitive to destination changes
      expect(originalFare).not.toEqual(updatedFare);
    });

    it('should recalculate final price correctly based on actual route taken', () => {
      // Simulating: passenger requests ride → gets updated price if destination changes → final price calculated
      const pickupLat = 23.7843, pickupLng = 90.4075;
      const destLat = 23.753,    destLng = 90.4015;
      
      // At creation
      const creationPrice = calculateFare(pickupLat, pickupLng, destLat, destLng);
      
      // Driver navigates and completes the ride
      // Final price is recalculated from same pickup->dest coordinates
      const completionPrice = calculateFare(pickupLat, pickupLng, destLat, destLng);
      
      // Should be identical (same route, same calculation)
      expect(creationPrice).toEqual(completionPrice);
    });
  });

  describe('Price Components Breakdown', () => {
    it('should have formula: $2 (base) + $1.50/km + $0.25/min', () => {
      // For ~6km trip (~14 minutes at 25 km/h)
      // Expected: $2 + (6 * $1.50) + (14 * $0.25) = $2 + $9 + $3.50 = $14.50
      const lat1 = 23.7843, lng1 = 90.4075;
      const lat2 = 23.753,  lng2 = 90.4015;
      
      const distance = calculateDistance(lat1, lng1, lat2, lng2);
      const duration = estimateDuration(distance);
      const fare = calculateFare(lat1, lng1, lat2, lng2);
      
      // Verify components match formula structure
      const expectedFare = 2 + (distance * 1.5) + (duration * 0.25);
      
      // Use Math.abs to handle floating point rounding differences
      const difference = Math.abs(fare - expectedFare);
      expect(difference).toBeLessThan(0.01); // Allow up to 0.01 difference
      
      // Also verify the calculation matches the rounding pattern we use
      expect(parseFloat(fare.toFixed(2))).toEqual(parseFloat(expectedFare.toFixed(2)));
    });
  });
});
