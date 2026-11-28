/** Shared Terrain profile policy; include its version in canonical height dependencies. */
export const RIVER_BANK_PROFILE_VERSION = "river-bank-c2-v1";

/** Quintic Hermite: values 0/1, initial derivative a, final derivative 0,
 * and zero second derivatives at both ends. Monotone for 0 <= a <= 2. */
export function riverBankBlend(t: number, a: number): number {
  t = Math.max(0, Math.min(1, t));
  return a * t + t * t * t * (10 - 6 * a + t * (-15 + 8 * a + t * (6 - 3 * a)));
}

/** Maximum bank envelope: taller cuts spread into dry terrain. */
export function riverBankReach(bankWidthM: number, bankRiseM: number): number {
  return Math.hypot(Math.max(0.01, bankWidthM), Math.max(0, bankRiseM) * 4);
}

/** One continuous wet/dry cross-section. Does not raise Terrain or change the water datum. */
export function planningRiverBankHeight(input: {
  natural: number;
  shoreline: number;
  bed: number;
  shoreGround: number;
  distance: number;
  inside: boolean;
  widthM: number;
  bankWidthM: number;
}): number {
  const { natural, shoreline, bed, shoreGround, distance, inside, widthM, bankWidthM } = input;
  const depth = Math.max(0, shoreline - bed),
    inner = Math.max(0.1, widthM * 0.35);
  const rise = Math.max(0, shoreGround - shoreline);
  // Keep a finite wet/dry crossing. A tiny slope across a long low bank amplifies
  // R16 quantization into jagged shoreline pixels. Low banks close sooner; high
  // banks use the full adaptive envelope. Both sides still share one slope.
  const slope = rise > 1e-8 ? Math.min((depth * 0.5) / inner, 0.25) : 0;
  const outer = Math.max(0.01, Math.min(riverBankReach(bankWidthM, rise), slope ? (2 * rise) / slope : Infinity));
  if (inside)
    return Math.min(natural, shoreline - depth * riverBankBlend(distance / inner, depth ? (slope * inner) / depth : 0));
  const localRise = Math.max(0, natural - shoreline);
  const derivative = localRise ? Math.min(2, (slope * outer) / localRise) : 0;
  return Math.min(natural, shoreline + localRise * riverBankBlend(distance / outer, derivative));
}
