import type { PlanPoint } from "../semantic-study/IslandPlanModel";
import type { PlanningResource } from "./PlanningResources";
import { spatialCompositionParameters, type SpatialCompositionParameters } from "./SpatialCompositionParameters";
import type { VolumeBox } from "./layout/Volumes";
import { settlementRandom } from "../semantic-study/SettlementGeometry";
import { boxGroundBottom } from "./layout/VolumeTerrain";

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
/** Closed rock bodies are published as ordinary native OBBs, never a height field.
 * Step height sets the rise, tread sets the horizontal body scale, and the existing
 * roughness controls footprint overlap/jitter. RockFormation owns the final surface. */
export function compositionReliefBoxes(value?: Partial<SpatialCompositionParameters>): VolumeBox[][] {
  const q = spatialCompositionParameters(value);
  if (!q.enabled || q.reliefSurface !== "rocks" || !q.backDepthM) return [];
  const result: VolumeBox[][] = [];
  for (const [side, relief] of [
    [-1, q.leftReliefM],
    [1, q.rightReliefM]
  ] as const) {
    if (!relief) continue;
    const rows = Math.ceil(relief / q.terraceStepHeightM),
      occupied = Math.min(q.widthM / 2, q.reliefBandWidthM || rows * q.terraceTreadM),
      width = occupied / rows;
    for (let row = 0; row < rows; row++) {
      // Successive shelves retreat towards the rear, creating projecting ledges
      // while the centre remains an open valley rather than a solid front wall.
      const front = (q.reliefFrontDepthM * (rows - row)) / rows,
        columns = Math.ceil((front + q.backDepthM) / q.terraceTreadM),
        depth = (front + q.backDepthM) / columns;
      for (let column = 0; column < columns; column++) {
        const jitter = (axis: string) =>
          (settlementRandom(q.seed, `composition:relief:${side}:${row}:${column}:${axis}`) - 0.5) * q.terrainRoughness;
        const x = side * (q.widthM / 2 - occupied + width * (row + 0.5 + jitter("x"))),
          z = -front + depth * (column + 0.5 + jitter("z"));
        result.push([
          {
            center: compositionPoint(q, x, z),
            width: width * (1 + q.terrainRoughness),
            depth: depth * (1 + q.terrainRoughness),
            height: Math.min(
              relief * (q.reliefFrontHeightRatio + ((1 - q.reliefFrontHeightRatio) * (column + 1)) / columns),
              relief * q.reliefInnerHeightRatio +
                (1 - q.reliefInnerHeightRatio) * Math.min(relief, (row + 1) * q.terraceStepHeightM)
            ),
            elevation: 0,
            yaw: (q.headingDegrees * Math.PI) / 180
          }
        ]);
      }
    }
  }
  return result;
}

/** Hydrology consumes the same published rock envelopes as the mesh generator.
 * This is a planning support query, not terrain displacement or a rendered raster. */
export function compositionReliefGround(
  value: Partial<SpatialCompositionParameters> | undefined,
  ground: (point: PlanPoint) => number
): (point: PlanPoint) => number {
  const boxes = compositionReliefBoxes(value)
    .flat()
    .map((box) => ({
      ...box,
      top: boxGroundBottom(box, ground) + box.height,
      c: Math.cos(box.yaw),
      s: Math.sin(box.yaw)
    }));
  if (!boxes.length) return ground;
  return (point) => {
    let height = ground(point);
    for (const box of boxes) {
      const dx = point.x - box.center.x,
        dz = point.z - box.center.z;
      if (Math.abs(dx * box.c + dz * box.s) <= box.width / 2 && Math.abs(-dx * box.s + dz * box.c) <= box.depth / 2)
        height = Math.max(height, box.top);
    }
    return height;
  };
}

/** Terrain terraces remain available for ordinary landforms. Rock mode publishes
 * only native rock volumes, including around waterfalls; it never raises Terrain. */
export function compositionTerrain(value?: Partial<SpatialCompositionParameters>): PlanningResource[] {
  const q = spatialCompositionParameters(value);
  if (!q.enabled || q.reliefSurface === "rocks") return [];
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
