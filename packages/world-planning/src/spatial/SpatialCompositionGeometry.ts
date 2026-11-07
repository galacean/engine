import type { PlanPoint } from "../semantic-study/IslandPlanModel";
import type { PlanningResource } from "./PlanningResources";
import { spatialCompositionParameters, type SpatialCompositionParameters } from "./SpatialCompositionParameters";

/** A shared local frame: X is screen-right and Z is depth. All generated systems
 * consume this frame; the frame and scalar controls are the only author inputs. */
export function compositionPoint(q: SpatialCompositionParameters, x: number, z: number): PlanPoint {
  const a = (q.headingDegrees * Math.PI) / 180,
    c = Math.cos(a),
    s = Math.sin(a);
  return { x: q.centerX - x * c - z * s, z: q.centerZ - x * s + z * c };
}
export function compositionOutline(value?: Partial<SpatialCompositionParameters>): PlanPoint[] | undefined {
  const q = spatialCompositionParameters(value);
  return q.enabled
    ? [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1]
      ].map(([x, z]) => compositionPoint(q, (x * q.widthM) / 2, z < 0 ? -q.frontDepthM : q.backDepthM))
    : undefined;
}
/** Smooth axis with endpoint-preserving lateral bends. Wavelength is a physical
 * distance, so increasing extent adds bends instead of stretching a point table. */
export function compositionAxis(
  q: SpatialCompositionParameters,
  t: number,
  end: PlanPoint = { x: 0, z: 0 }
): PlanPoint {
  const dz = end.z + q.frontDepthM,
    length = Math.hypot(end.x, dz);
  const bend = q.roadBendM * Math.sin((2 * Math.PI * length * t) / q.roadWavelengthM) * Math.sin(Math.PI * t) ** 2;
  return { x: end.x * t + (bend * dz) / length, z: -q.frontDepthM + dz * t - (bend * end.x) / length };
}
export function compositionLane(
  q: SpatialCompositionParameters,
  t: number,
  offset: number,
  end?: PlanPoint
): PlanPoint {
  const p = compositionAxis(q, t, end),
    a = compositionAxis(q, Math.max(0, t - 1e-4), end),
    b = compositionAxis(q, Math.min(1, t + 1e-4), end),
    length = Math.hypot(b.x - a.x, b.z - a.z);
  return { x: p.x + (offset * (b.z - a.z)) / length, z: p.z - (offset * (b.x - a.x)) / length };
}
/** Analytic terraces compile to the existing native terrain feature vocabulary.
 * The number of shelves follows total relief / step height, not a template list.
 * These resources are ephemeral sampler inputs, never serialized author state. */
export function compositionTerrain(value?: Partial<SpatialCompositionParameters>): PlanningResource[] {
  const q = spatialCompositionParameters(value);
  if (!q.enabled) return [];
  const result: PlanningResource[] = [];
  for (const [side, relief] of [
    [-1, q.leftReliefM],
    [1, q.rightReliefM]
  ] as const) {
    const steps = Math.ceil(relief / q.terraceStepHeightM);
    const occupied = Math.min(q.widthM / 2, steps * q.terraceTreadM);
    for (let i = 0; i < steps; i++) {
      const width = (occupied * (steps - i)) / steps,
        x = side * (q.widthM / 2 - width / 2);
      const p = compositionPoint(q, x, q.backDepthM / 2);
      result.push({
        resourceId: `composition:terrace:${side}:${i}`,
        resourceType: "terrain-feature",
        properties: {
          kind: "plateau",
          x: p.x,
          z: p.z,
          headingDegrees: q.headingDegrees,
          lengthMetres: q.backDepthM,
          widthMetres: width,
          elevationDeltaMetres: Math.min(q.terraceStepHeightM, relief - i * q.terraceStepHeightM),
          sharpness: q.cliffSharpness,
          asymmetry: 0.5,
          roughness: q.terrainRoughness,
          erosion: 0,
          seed: (q.seed + i) >>> 0
        }
      });
    }
  }
  return result;
}
