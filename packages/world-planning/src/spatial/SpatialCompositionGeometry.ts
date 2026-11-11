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

function reliefBandWidth(q: SpatialCompositionParameters, height: number): number {
  return height > 0
    ? Math.min(q.widthM / 2, q.reliefBandWidthM || Math.ceil(height / q.terraceStepHeightM) * q.terraceTreadM)
    : 0;
}

export function compositionSubjectTerraceBox(q: SpatialCompositionParameters): VolumeBox | undefined {
  if (!q.enabled || q.reliefSurface !== "rocks" || q.subjectTerraceHeightM <= 0 || q.subjectTerraceRadiusM <= 0)
    return undefined;
  const diameter = 2 * q.subjectTerraceRadiusM;
  return {
    center: { x: q.centerX, z: q.centerZ },
    width: diameter,
    depth: diameter,
    height: q.subjectTerraceHeightM,
    elevation: 0,
    yaw: (q.headingDegrees * Math.PI) / 180
  };
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
      occupied = reliefBandWidth(q, relief),
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
  // Behind the subject, bridge the open span between the two side walls with
  // lower shelves in front of a taller saddle. Each tread remains plantable.
  const rearDepth = Math.min(q.rearReliefDepthM, q.backDepthM),
    left = -q.widthM / 2 + reliefBandWidth(q, q.leftReliefM),
    right = q.widthM / 2 - reliefBandWidth(q, q.rightReliefM);
  if (q.rearReliefM > 0 && rearDepth > 0 && right > left) {
    const rows = Math.ceil(rearDepth / q.terraceTreadM),
      columns = Math.ceil((right - left) / q.terraceTreadM),
      width = (right - left) / columns,
      depth = rearDepth / rows;
    for (let row = 0; row < rows; row++)
      for (let column = 0; column < columns; column++) {
        const jitter = (axis: string) =>
          (settlementRandom(q.seed, `composition:relief:rear:${row}:${column}:${axis}`) - 0.5) * q.terrainRoughness;
        const across = (column + 0.5 + jitter("x")) / columns,
          x = left + across * (right - left),
          z = q.backDepthM - rearDepth + depth * (row + 0.5 + jitter("z")),
          crest =
            q.rearReliefM * (q.reliefInnerHeightRatio + (1 - q.reliefInnerHeightRatio) * Math.abs(2 * across - 1));
        result.push([
          {
            center: compositionPoint(q, x, z),
            width: width * (1 + q.terrainRoughness),
            depth: depth * (1 + q.terrainRoughness),
            height: Math.max(Math.min(q.terraceStepHeightM, crest), crest - (rows - 1 - row) * q.terraceStepHeightM),
            elevation: 0,
            yaw: (q.headingDegrees * Math.PI) / 180
          }
        ]);
      }
  }
  if (q.bankReliefM > 0) {
    const shore = q.roadWidthM / 2 + 2 * q.bankWidthM + q.streamWidthM;
    const front = Math.min(q.frontDepthM, q.reliefFrontDepthM + q.terraceTreadM);
    const back = Math.min(q.backDepthM - rearDepth, 2 * q.terraceTreadM);
    const columns = Math.max(1, Math.floor((front + back) / (1.5 * q.terraceTreadM)));
    const cellDepth = (front + back) / columns;
    const yaw = (q.headingDegrees * Math.PI) / 180;
    for (const [side, wall] of [
      [-1, -left],
      [1, right]
    ] as const) {
      const band = wall - shore;
      if (band <= 0) continue;
      for (let column = 0; column < columns; column++) {
        const random = (key: string) => settlementRandom(q.seed, `composition:relief:bank:${side}:${column}:${key}`);
        const width = Math.min(band, q.terraceTreadM * (1.1 + 0.35 * random("width")));
        const inner = shore + (band - width) * random("bank-offset");
        const z = -front + (column + 0.5 + (random("depth-offset") - 0.5) * q.terrainRoughness) * cellDepth;
        const depth = cellDepth * (0.55 + 0.25 * random("depth"));
        const crest = q.bankReliefM * (0.58 + 0.42 * random("height"));
        const lowerWidth = width * 0.65;
        const upperWidth = width * 0.6;
        // The upper shoulder overlaps the lower body, leaving a planted tread on the water side.
        const lower: VolumeBox = {
          center: compositionPoint(q, side * (inner + lowerWidth / 2), z),
          width: lowerWidth,
          depth,
          height: crest * (0.32 + 0.18 * random("step")),
          elevation: 0,
          yaw
        };
        const upper: VolumeBox = {
          center: compositionPoint(
            q,
            side * (inner + width - upperWidth / 2),
            z + ((random("stagger") - 0.5) * depth) / 4
          ),
          width: upperWidth,
          depth: depth * (0.7 + 0.15 * random("shoulder")),
          height: crest,
          elevation: 0,
          yaw
        };
        result.push([lower], [upper]);
      }
    }
  }
  if (q.subjectTerraceHeightM > 0 && q.subjectTerraceRadiusM > 0) {
    const radius = q.subjectTerraceRadiusM;
    const count = Math.ceil((Math.PI * radius) / q.terraceTreadM);
    const step = Math.PI / count;
    const width = 2 * radius * Math.sin(step / 2);
    // Independent rock faces break up the front edge of the subject terrace.
    for (let i = 0; i < count; i++) {
      const random = (key: string) => settlementRandom(q.seed, `composition:relief:subject:${i}:${key}`);
      const angle = (i + 0.5) * step - Math.PI / 2;
      const edge = radius * (0.96 + ((random("edge") - 0.5) * q.terrainRoughness) / 2);
      result.push([
        {
          center: compositionPoint(q, edge * Math.sin(angle), -edge * Math.cos(angle)),
          width: width * (1 + q.terrainRoughness * random("width")),
          depth: Math.min(radius, q.terraceTreadM),
          height: q.subjectTerraceHeightM * (0.68 + 0.28 * random("height")),
          elevation: 0,
          yaw: (q.headingDegrees * Math.PI) / 180 - angle
        }
      ]);
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

/** Displacement features for compositions that sculpt the terrain surface. */
export function compositionTerrain(value?: Partial<SpatialCompositionParameters>): PlanningResource[] {
  const q = spatialCompositionParameters(value);
  if (!q.enabled || q.reliefSurface === "rocks") return [];
  const result: PlanningResource[] = [];
  if (q.subjectTerraceHeightM > 0 && q.subjectTerraceRadiusM > 0) {
    const diameter = 2 * q.subjectTerraceRadiusM;
    result.push({
      resourceId: "composition:terrace:subject",
      resourceType: "terrain-feature",
      properties: {
        kind: "plateau",
        x: q.centerX,
        z: q.centerZ,
        lengthMetres: diameter,
        widthMetres: diameter,
        headingDegrees: q.headingDegrees,
        elevationDeltaMetres: q.subjectTerraceHeightM,
        sharpness: q.cliffSharpness,
        asymmetry: q.terrainRoughness,
        roughness: q.terrainRoughness,
        erosion: 0,
        seed: q.seed
      }
    });
  }
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
