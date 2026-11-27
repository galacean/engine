import type { PlanPoint } from "../../semantic-study/IslandPlanModel";
import { createPlanningRingQuery } from "../../semantic-study/WorldPlanningTerrain";
import { bounds } from "../layout/Volumes";

/** Sample dry land throughout each management region on a shared 16 m grid.
 * Values measure terrain-band displacement, independently of base noise or content identity.
 * Empty arrays mean no sampled dry land, not a flat region. Sampling is for ranking;
 * accepted footprints are checked separately at finer spacing.
 */
export function sampleRegionRelief(
  outlines: ReadonlyMap<string, readonly PlanPoint[]>,
  displacement: (p: PlanPoint) => number,
  dry: (p: PlanPoint) => boolean
): Record<string, number[]> {
  return Object.fromEntries(
    [...outlines].map(([id, outline]) => {
      if (outline.length < 3) return [id, []];
      const ring = createPlanningRingQuery([...outline]),
        b = bounds([...outline]),
        values: number[] = [];
      for (let z = Math.ceil((b.z0 - 8) / 16) * 16 + 8; z <= b.z1; z += 16)
        for (let x = Math.ceil((b.x0 - 8) / 16) * 16 + 8; x <= b.x1; x += 16) {
          const p = { x, z };
          if (ring.inside(p) && dry(p)) values.push(displacement(p));
        }
      // Small cells may lie entirely between grid points; inspect their interior as well.
      if (!values.length) {
        const p = {
          x: outline.reduce((s, p) => s + p.x, 0) / outline.length,
          z: outline.reduce((s, p) => s + p.z, 0) / outline.length
        };
        if (ring.inside(p) && dry(p)) values.push(displacement(p));
      }
      return [id, values];
    })
  );
}

/** Check a rectangular footprint, including its boundary, at at most 2 m spacing.
 * The policy is supplied by the caller; this query neither flattens terrain nor relocates content.
 */
export function footprintWithinRelief(
  outline: readonly PlanPoint[],
  displacement: (p: PlanPoint) => number,
  maximumM: number
): boolean {
  const [a, b, , d] = outline;
  if (!a || !b || !d) return false;
  const nx = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 2));
  const nz = Math.max(1, Math.ceil(Math.hypot(d.x - a.x, d.z - a.z) / 2));
  for (let iz = 0; iz <= nz; iz++)
    for (let ix = 0; ix <= nx; ix++) {
      const p = {
        x: a.x + ((b.x - a.x) * ix) / nx + ((d.x - a.x) * iz) / nz,
        z: a.z + ((b.z - a.z) * ix) / nx + ((d.z - a.z) * iz) / nz
      };
      if (displacement(p) > maximumM + 1e-6) return false;
    }
  return true;
}
