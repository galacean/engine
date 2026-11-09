/** Recovered facade-finish rules, generate_plaster_mesh_and_entities
 * (0x101051fdc). These reserve exposed masonry at a flat roof's crown; they
 * constrain the finish domain, never move the wall, roof or plaster mesh.
 * Physical backing and authored cuts further restrict this permission. */
export const FLAT_PLASTER_CROWN = 0.3;
export const FLAT_PLASTER_NO_RIM_SHORTENING = 0.79 - 0.15;

export function plasterFinishTop(topY: number, flat: boolean, withoutRim: boolean): number {
  if (!flat) return Infinity;
  return Math.min(topY - FLAT_PLASTER_CROWN, withoutRim ? topY - FLAT_PLASTER_NO_RIM_SHORTENING : Infinity);
}
