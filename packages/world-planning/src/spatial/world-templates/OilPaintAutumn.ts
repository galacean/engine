import { settlementRandom } from "../../semantic-study/SettlementGeometry";
import { templateBaseSeed } from "../WorldTemplateCatalog";
import type { WorldTemplateArtDirection } from "../WorldTemplateArtDirection";
import type { TemplateProceduralPlantInstance } from "../runtime/TemplateProceduralPlants";

type Point = [number, number];
type WaterDef = NonNullable<WorldTemplateArtDirection["water"]>[number];
type PlantingDef = NonNullable<WorldTemplateArtDirection["plantings"]>[number];
type StoneDef = NonNullable<WorldTemplateArtDirection["stones"]>[number];

const SPAWN_X = -4.5;
const SPAWN_Z = -33;
const VISTA_FOCUS_X = 35.5;
const VISTA_FOCUS_Z = 10;

// Camera-relative horizontal basis in world space (matching spawn -> vista focus sightline):
// worldFwd = normalize(anchor - focus - (anchor - spawn)) = normalize(SPAWN_X - VISTA_FOCUS_X, VISTA_FOCUS_Z - SPAWN_Z)
// worldRight = cross(worldFwd, +Y) = (-worldFwd.z, worldFwd.x)
const VIEW_DX = SPAWN_X - VISTA_FOCUS_X;
const VIEW_DZ = VISTA_FOCUS_Z - SPAWN_Z;
const VIEW_LEN = Math.hypot(VIEW_DX, VIEW_DZ) || 1;
const CAM_FWD_X = VIEW_DX / VIEW_LEN;
const CAM_FWD_Z = VIEW_DZ / VIEW_LEN;
const CAM_RIGHT_X = -CAM_FWD_Z;
const CAM_RIGHT_Z = CAM_FWD_X;

function camRelToWorldDelta(rightM: number, forwardM: number): readonly [number, number] {
  return [rightM * CAM_RIGHT_X + forwardM * CAM_FWD_X, rightM * CAM_RIGHT_Z + forwardM * CAM_FWD_Z];
}

function camRelToLocal(rightM: number, forwardM: number): readonly [number, number] {
  const [wdx, wdz] = camRelToWorldDelta(rightM, forwardM);
  return [SPAWN_X - wdx, SPAWN_Z + wdz];
}

function createSeededRng(seed: number, salt: string): () => number {
  let step = 0;
  return () => settlementRandom(seed, `oil-paint:${salt}:${step++}`);
}

function pointInPolygon(x: number, z: number, poly: readonly Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0];
    const zi = poly[i][1];
    const xj = poly[j][0];
    const zj = poly[j][1];
    const intersect = zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi + 1e-6) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function distanceToPolygonEdge(x: number, z: number, poly: readonly Point[]): number {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const [ax, az] = poly[i];
    const [bx, bz] = poly[(i + 1) % poly.length];
    const dx = bx - ax;
    const dz = bz - az;
    const lenSq = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / lenSq));
    const d = Math.hypot(x - (ax + dx * t), z - (az + dz * t));
    if (d < best) best = d;
  }
  return best;
}

function segmentsIntersect(a: Point, b: Point, c: Point, d: Point): boolean {
  const cross = (p: Point, q: Point, r: Point) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const d1 = cross(a, b, c);
  const d2 = cross(a, b, d);
  const d3 = cross(c, d, a);
  const d4 = cross(c, d, b);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

function polygonSelfIntersects(poly: readonly Point[]): boolean {
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % n];
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 0.25) return true;
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      if (segmentsIntersect(a, b, poly[j], poly[(j + 1) % n])) return true;
    }
  }
  return false;
}

function isNearLake(x: number, z: number, poly: readonly Point[], margin: number): boolean {
  return pointInPolygon(x, z, poly) || (margin > 0 && distanceToPolygonEdge(x, z, poly) < margin);
}

/**
 * Zero hardcoded tree coordinates!
 * Trees, shrubs, companion stones, and 360° radial falloff are driven 100% natively by
 * `spawnPoi` (area `sizeWeight` + `landscape.density` + `falloffRatio` + `exclusionRadiusScale`)
 * and `initialLandscape` in `WorldTemplateArtDirection.ts`.
 */
export const OIL_PAINT_PLANTINGS: PlantingDef[] = [];

export interface OilPaintAutumnLayout {
  readonly water: WaterDef[];
  readonly stones: StoneDef[];
  readonly proceduralPlants: TemplateProceduralPlantInstance[];
  /** Per-Seed randomized world offset `[dx, dz]` from spawn for the habitable cottage/tower POI. */
  readonly buildingAnchorOffset: readonly [number, number];
}

const layoutCache = new Map<number, OilPaintAutumnLayout>();

/**
 * Deterministic per-Seed water, lakeside accent stones, and lightweight GPU-instanced grass tufts
 * for the Oil Paint Autumn Wood template:
 * - Per-Seed randomized nearby woodland lake visible from spawn (native `ContextLandscape` automatically
 *   keeps trees outside the lake shoreline on every seed!)
 * - Subtle lakeside accent stones + 3 sparse distant horizon rocks (tree-root companion stones are generated
 *   natively by `spawnPoi.landscape.companionStoneDensity`)
 * - Lean GPU-instanced low-poly grass tufts (1 draw call) around spawn & lake shore
 */
export function resolveOilPaintAutumn(seed: number): OilPaintAutumnLayout {
  const cached = layoutCache.get(seed);
  if (cached) return cached;

  const rnd = createSeededRng(seed, "layout");
  const range = (min: number, max: number) => min + (max - min) * rnd();

  // 1. Per-Seed symmetric camera-relative organic woodland lake:
  //    4 balanced archetypes (screen-left, screen-right, center-far, or off-axis side tarn)
  //    so lakes naturally appear on the left, right, straight ahead, or tucked off to the side.
  const angleDiff = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
  const segments = 40;
  let lakeCx = 0;
  let lakeCz = 0;
  let majorR = 19;
  let shoreline: Point[] = [];
  let maxRadius = 0;

  for (let lakeAttempt = 0; lakeAttempt < 48; lakeAttempt++) {
    const modeRoll = rnd();
    let lakeRightM: number;
    let lakeForwardM: number;
    if (modeRoll < 0.27) {
      // Screen-left woodland lake
      lakeRightM = range(-36.0, -14.0);
      lakeForwardM = range(20.0, 46.0);
    } else if (modeRoll < 0.54) {
      // Screen-right woodland lake (exact mirror of screen-left!)
      lakeRightM = range(14.0, 36.0);
      lakeForwardM = range(20.0, 46.0);
    } else if (modeRoll < 0.74) {
      // Center-forward meadow pond (cleanly between spawn and vista focus)
      lakeRightM = range(-12.0, 12.0);
      lakeForwardM = range(29.0, 40.0);
    } else {
      // Side / off-screen woodland tarn (50% far left, 50% far right)
      const side = rnd() < 0.5 ? -1 : 1;
      lakeRightM = side * range(28.0, 48.0);
      lakeForwardM = range(-8.0, 26.0);
    }
    [lakeCx, lakeCz] = camRelToLocal(lakeRightM, lakeForwardM);
    majorR = range(14.5, 22.0);
    const minorR = range(9.0, 14.0);
    const lakeYaw = range(-1.45, 1.45);
    const cosYaw = Math.cos(lakeYaw);
    const sinYaw = Math.sin(lakeYaw);

    // Sculpt 3 asymmetric sheltered coves (pinches) and 2 protruding headlands/lobes like OasisFloodplain.ts
    const coveCount = 3;
    const coves = Array.from({ length: coveCount }, (_, i) => ({
      angle: (i / coveCount) * Math.PI * 2 + range(-0.45, 0.45),
      depth: range(0.24, 0.38),
      width: range(0.36, 0.56)
    }));
    const lobes = Array.from({ length: 2 }, (_, i) => ({
      angle: coves[i].angle + Math.PI / coveCount + range(-0.35, 0.35),
      boost: range(0.2, 0.34),
      width: range(0.45, 0.68)
    }));
    const bendAmp = Math.min(minorR * 0.26, range(1.8, 3.6)) * (rnd() < 0.5 ? -1 : 1);
    const bendPhase = range(-0.6, 0.6);
    const phase2 = range(0, Math.PI * 2);
    const phase4 = range(0, Math.PI * 2);
    const phase5 = range(0, Math.PI * 2);

    const candidate: Point[] = [];
    let candidateMaxR = 0;
    for (let i = 0; i < segments; i++) {
      const theta = (i / segments) * Math.PI * 2;
      let radial =
        1.0 +
        0.1 * Math.sin(theta * 2 + phase2) +
        0.06 * Math.cos(theta * 4 + phase4) +
        0.04 * Math.sin(theta * 5 + phase5);
      for (const cove of coves) {
        const d = angleDiff(theta, cove.angle) / cove.width;
        radial -= cove.depth * Math.exp(-0.5 * d * d);
      }
      for (const lobe of lobes) {
        const d = angleDiff(theta, lobe.angle) / lobe.width;
        radial += lobe.boost * Math.exp(-0.5 * d * d);
      }
      radial = Math.max(0.48, Math.min(1.42, radial));

      const lx = Math.cos(theta) * majorR * radial;
      const lzBase = Math.sin(theta) * minorR * radial;
      const spineT = Math.max(-1, Math.min(1, lx / majorR));
      const lz = lzBase + Math.sin(spineT * Math.PI + bendPhase) * bendAmp;

      const wx = lakeCx + lx * cosYaw - lz * sinYaw;
      const wz = lakeCz + lx * sinYaw + lz * cosYaw;

      const rx = Math.round(wx * 10) / 10;
      const rz = Math.round(wz * 10) / 10;
      candidateMaxR = Math.max(candidateMaxR, Math.hypot(rx - lakeCx, rz - lakeCz));
      candidate.push([rx, rz]);
    }

    if (polygonSelfIntersects(candidate)) continue;
    if (
      isNearLake(SPAWN_X, SPAWN_Z, candidate, 12.5) ||
      isNearLake(-2.0, -30.0, candidate, 10.5) ||
      isNearLake(VISTA_FOCUS_X, VISTA_FOCUS_Z, candidate, 6.5)
    ) {
      continue;
    }
    shoreline = candidate;
    maxRadius = candidateMaxR;
    break;
  }
  if (!shoreline.length) {
    // Guaranteed clean fallback oval well clear of spawn, clearing, and vista focus
    lakeCx = -10;
    lakeCz = 18;
    majorR = 18;
    maxRadius = 18;
    for (let i = 0; i < segments; i++) {
      const theta = (i / segments) * Math.PI * 2;
      shoreline.push([
        Math.round((lakeCx + Math.cos(theta) * 18) * 10) / 10,
        Math.round((lakeCz + Math.sin(theta) * 12) * 10) / 10
      ]);
    }
  }

  // Keep the woodland pond a clean shallow basin without a tiny submerged islet hole
  // (on gently sloping terrain a small uncarved hole can sit below waterLevel and trap land animals underwater).
  const water: WaterDef[] = [
    {
      id: "autumn-lake",
      x: lakeCx,
      z: lakeCz,
      radius: Math.max(maxRadius, majorR) * 1.15,
      depth: 0.65,
      color: [38, 92, 114],
      depthTintDistanceM: 0.45,
      bankWidthM: 3.2,
      shoreline
    }
  ];

  // 2. Lakeside accent stones nestled along coves/headlands (distant mountain peaks are generated natively by outer POIs)
  const stones: StoneDef[] = [];
  let stoneIdx = 1;
  for (let i = 0; i < 4; i++) {
    const pt = shoreline[(Math.floor(rnd() * segments) + i * 9) % segments];
    const outX = pt[0] - lakeCx;
    const outZ = pt[1] - lakeCz;
    const len = Math.hypot(outX, outZ) || 1;
    const sx = pt[0] + (outX / len) * 1.3;
    const sz = pt[1] + (outZ / len) * 1.3;
    const w = range(1.6, 2.8);
    const d = w * range(0.76, 0.92);
    const h = w * range(0.48, 0.66);
    stones.push({
      id: `oil-paint-shore-stone-${stoneIdx++}`,
      x: sx,
      z: sz,
      y: -h * 0.24,
      width: w,
      depth: d,
      height: h,
      yawDegrees: Math.round(range(0, 360))
    });
  }

  // 3. Procedural wind-blown grass tufts intentionally disabled for oil-paint (user feedback: harsh wind bending).
  const proceduralPlants: TemplateProceduralPlantInstance[] = [];

  // 4. Per-Seed symmetric camera-relative cottage/tower POI anchor offset [dx, dz] (world delta from spawn):
  //    Balanced left / right / center-meadow / side-woods distribution so buildings appear equally on either
  //    side (or tucked outside the opening frustum) while strictly staying dry outside this Seed's lake.
  const bRnd = createSeededRng(seed, "building-anchor");
  const bRange = (min: number, max: number) => min + (max - min) * bRnd();
  const preferredSide = bRnd() < 0.5 ? -1 : 1;
  const preferredRoll = bRnd();
  let buildingAnchorOffset: readonly [number, number] = camRelToWorldDelta(preferredSide * 18, 22);
  for (let attempt = 0; attempt < 48; attempt++) {
    let bRightM: number;
    let bForwardM: number;
    // Keep preferred left/right side for the first 16 tries so one side's lake never systematically pushes all houses opposite
    const side = attempt < 16 ? preferredSide : bRnd() < 0.5 ? -1 : 1;
    const mode = attempt < 16 ? preferredRoll : bRnd();
    if (mode < 0.68) {
      // Screen-left or screen-right midground cottage
      bRightM = side * bRange(10.0, 32.0);
      bForwardM = bRange(16.0, 40.0);
    } else if (mode < 0.84) {
      // Center-forward across the sunlit meadow
      bRightM = bRange(-10.0, 10.0);
      bForwardM = bRange(20.0, 38.0);
    } else {
      // Side woodland glade (glimpsed at frame edge or discovered while roaming)
      bRightM = side * bRange(26.0, 44.0);
      bForwardM = bRange(-4.0, 20.0);
    }
    const [worldDx, worldDz] = camRelToWorldDelta(bRightM, bForwardM);
    const localX = SPAWN_X - worldDx;
    const localZ = SPAWN_Z + worldDz;
    if (isNearLake(localX, localZ, shoreline, 12.5)) continue;
    if (Math.hypot(localX - -2.0, localZ - -30.0) < 15.0) continue;
    if (Math.hypot(localX - VISTA_FOCUS_X, localZ - VISTA_FOCUS_Z) < 10.0) continue;
    buildingAnchorOffset = [Math.round(worldDx * 10) / 10, Math.round(worldDz * 10) / 10];
    break;
  }

  const resolved: OilPaintAutumnLayout = { water, stones, proceduralPlants, buildingAnchorOffset };
  layoutCache.set(seed, resolved);
  return resolved;
}

const DEFAULT_LAYOUT = resolveOilPaintAutumn(templateBaseSeed("oil-paint"));

export const OIL_PAINT_LAKE_SHORELINE: Point[] = DEFAULT_LAYOUT.water[0].shoreline!.map(([x, z]) => [x, z] as Point);
export const OIL_PAINT_ROCKS: NonNullable<WorldTemplateArtDirection["stones"]> = DEFAULT_LAYOUT.stones;
export const OIL_PAINT_WATER: NonNullable<WorldTemplateArtDirection["water"]> = DEFAULT_LAYOUT.water;
export const OIL_PAINT_PROCEDURAL_PLANTS: TemplateProceduralPlantInstance[] = DEFAULT_LAYOUT.proceduralPlants;
