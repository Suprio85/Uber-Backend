import { calculateHeading, pickupRoute, tripRoute } from '../services/simulation/waypoints';

describe('waypoint simulation utilities', () => {
  it('returns valid heading in [0, 360)', () => {
    const heading = calculateHeading(23.7843, 90.4075, 23.7852, 90.4075);
    expect(heading).toBeGreaterThanOrEqual(0);
    expect(heading).toBeLessThan(360);
  });

  it('is directionally consistent for north/east movement', () => {
    const northHeading = calculateHeading(23.7, 90.4, 23.8, 90.4);
    const eastHeading = calculateHeading(23.7, 90.4, 23.7, 90.5);

    expect(northHeading).toBeLessThan(20);
    expect(eastHeading).toBeGreaterThan(70);
    expect(eastHeading).toBeLessThan(110);
  });

  it('contains realistic route samples', () => {
    expect(pickupRoute.length).toBeGreaterThan(10);
    expect(tripRoute.length).toBeGreaterThan(20);

    expect(pickupRoute[0]).toEqual(expect.objectContaining({ lat: expect.any(Number), lng: expect.any(Number) }));
    expect(tripRoute[tripRoute.length - 1]).toEqual(expect.objectContaining({ lat: expect.any(Number), lng: expect.any(Number) }));
  });
});
