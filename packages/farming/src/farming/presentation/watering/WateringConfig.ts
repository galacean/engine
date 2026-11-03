/** Authored Watering clip: 60 fps, 0..2 seconds. GLB uses metres and Y-up. */
export const WATERING_CONFIG = Object.freeze({
  splashUrl: new URL("../../assets/watering/splash-2x2.png", import.meta.url).href,
  duration: 2,
  waterOn: 0.5,
  waterOff: 1.5,
  speed: 0.8,
  gravity: 9.81,
  dropsPerSecond: 420,
  impactInterval: 0.06
});

/** Central ballistic path; cone spread supplies the surrounding drops. */
export function waterFlightSeconds(height: number, verticalSpeed: number): number {
  return height <= 0
    ? 0
    : (verticalSpeed + Math.sqrt(verticalSpeed ** 2 + 2 * WATERING_CONFIG.gravity * height)) / WATERING_CONFIG.gravity;
}
