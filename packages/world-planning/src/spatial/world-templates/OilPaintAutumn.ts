import { settlementRandom } from "../../semantic-study/SettlementGeometry";
import { templateBaseSeed } from "../WorldTemplateCatalog";
import type { WorldTemplateArtDirection } from "../WorldTemplateArtDirection";
import type { TemplateProceduralPlantInstance } from "../runtime/TemplateProceduralPlants";

type Point = [number, number];
type WaterDef = NonNullable<WorldTemplateArtDirection["water"]>[number];
type PlantingDef = NonNullable<WorldTemplateArtDirection["plantings"]>[number];
type StoneDef = NonNullable<WorldTemplateArtDirection["stones"]>[number];

const SPAWN_X = 0;
const SPAWN_Z = -39;
const VISTA_FOCUS_X = 0;
const VISTA_FOCUS_Z = 26;

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

  // 1. Desert-oasis-inspired organic meandering woodland lake per Seed (multi-cove bays, headlands, S-bend, optional islet).
  const modeRoll = rnd();
  let lakeCx: number;
  let lakeCz: number;
  if (modeRoll < 0.35) {
    lakeCx = range(-11.5, -5.0);
    lakeCz = range(-7.0, 2.5);
  } else if (modeRoll < 0.7) {
    lakeCx = range(5.0, 11.5);
    lakeCz = range(-7.0, 2.5);
  } else {
    lakeCx = range(-4.5, 4.5);
    lakeCz = range(-7.5, 1.5);
  }
  const majorR = range(18.5, 23.5);
  const minorR = range(11.0, 14.8);
  const lakeYaw = range(-0.85, 0.85);
  const cosYaw = Math.cos(lakeYaw);
  const sinYaw = Math.sin(lakeYaw);

  // Sculpt 3 asymmetric sheltered coves (pinches) and 2 protruding headlands/lobes like OasisFloodplain.ts
  const coveCount = 3;
  const coves = Array.from({ length: coveCount }, (_, i) => ({
    angle: (i / coveCount) * Math.PI * 2 + range(-0.45, 0.45),
    depth: range(0.28, 0.44),
    width: range(0.32, 0.52)
  }));
  const lobes = Array.from({ length: 2 }, (_, i) => ({
    angle: coves[i].angle + Math.PI / coveCount + range(-0.35, 0.35),
    boost: range(0.22, 0.38),
    width: range(0.45, 0.68)
  }));
  const bendAmp = range(2.2, 4.4) * (rnd() < 0.5 ? -1 : 1);
  const bendPhase = range(-0.6, 0.6);
  const phase2 = range(0, Math.PI * 2);
  const phase4 = range(0, Math.PI * 2);
  const phase5 = range(0, Math.PI * 2);

  const angleDiff = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
  const shoreline: Point[] = [];
  const segments = 40;
  let maxRadius = 0;
  for (let i = 0; i < segments; i++) {
    const theta = (i / segments) * Math.PI * 2;
    let radial =
      1.0 +
      0.1 * Math.sin(theta * 2 + phase2) +
      0.07 * Math.cos(theta * 4 + phase4) +
      0.045 * Math.sin(theta * 5 + phase5);
    for (const cove of coves) {
      const d = angleDiff(theta, cove.angle) / cove.width;
      radial -= cove.depth * Math.exp(-0.5 * d * d);
    }
    for (const lobe of lobes) {
      const d = angleDiff(theta, lobe.angle) / lobe.width;
      radial += lobe.boost * Math.exp(-0.5 * d * d);
    }
    radial = Math.max(0.42, Math.min(1.48, radial));

    const lx = Math.cos(theta) * majorR * radial;
    const lzBase = Math.sin(theta) * minorR * radial;
    // Gentle S-curve spine bend along the major axis (creates natural meandering shore)
    const spineT = Math.max(-1, Math.min(1, lx / majorR));
    const lz = lzBase + Math.sin(spineT * Math.PI + bendPhase) * bendAmp;

    let wx = lakeCx + lx * cosYaw - lz * sinYaw;
    let wz = lakeCz + lx * sinYaw + lz * cosYaw;

    // Guarantee dry clearance around spawn (0, -39) AND the vista framing focus (0, 26) on every Seed
    const dSpawnX = wx - SPAWN_X;
    const dSpawnZ = wz - SPAWN_Z;
    const dSpawn = Math.hypot(dSpawnX, dSpawnZ);
    const minSpawnClearM = 10.5;
    if (dSpawn < minSpawnClearM) {
      const push = minSpawnClearM / Math.max(dSpawn, 0.5);
      wx = SPAWN_X + dSpawnX * push;
      wz = SPAWN_Z + dSpawnZ * push;
    }
    const dFocusX = wx - VISTA_FOCUS_X;
    const dFocusZ = wz - VISTA_FOCUS_Z;
    const dFocus = Math.hypot(dFocusX, dFocusZ);
    const minFocusClearM = 5.5;
    if (dFocus < minFocusClearM) {
      const push = minFocusClearM / Math.max(dFocus, 0.5);
      wx = VISTA_FOCUS_X + dFocusX * push;
      wz = VISTA_FOCUS_Z + dFocusZ * push;
    }
    if (wz > VISTA_FOCUS_Z - 4.5 && Math.abs(wx - VISTA_FOCUS_X) < 5.5) {
      wz = VISTA_FOCUS_Z - 4.5;
    }

    const rx = Math.round(wx * 10) / 10;
    const rz = Math.round(wz * 10) / 10;
    maxRadius = Math.max(maxRadius, Math.hypot(rx - lakeCx, rz - lakeCz));
    shoreline.push([rx, rz]);
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
      yawDegrees: Math.round(range(0, 360)),
      collision: true
    });
  }

  // 3. Lean GPU-instanced low-poly foreground & lakeside grass tufts (1 draw call total)
  const proceduralPlants: TemplateProceduralPlantInstance[] = [];
  let tuftIdx = 1;
  const pushTuft = (x: number, z: number, heightM: number, spreadScale: number, kind: "dry-grass" | "plume-grass") => {
    if (Math.hypot(x - SPAWN_X, z - SPAWN_Z) < 2.2) return;
    if (isNearLake(x, z, shoreline, 0.7)) return;
    proceduralPlants.push({
      id: `oil-paint-tuft-${tuftIdx++}`,
      kind,
      x,
      z,
      heightM,
      spreadScale,
      yawDegrees: Math.round(range(0, 360))
    });
  };

  // Organic 360° grass tufts around spawn (16 total) + 6 tufts along this seed's randomized shoreline
  for (let i = 0; i < 16; i++) {
    const ang = (i / 16) * Math.PI * 2 + range(-0.22, 0.22);
    const dist = range(3.5, 11.5);
    const tx = SPAWN_X + Math.cos(ang) * dist;
    const tz = SPAWN_Z + Math.sin(ang) * dist;
    pushTuft(tx, tz, range(0.46, 0.78), range(1.4, 1.85), rnd() < 0.24 ? "plume-grass" : "dry-grass");
  }
  for (let i = 0; i < 6; i++) {
    const pt = shoreline[(Math.floor(rnd() * segments) + i * 3) % segments];
    const outX = pt[0] - lakeCx;
    const outZ = pt[1] - lakeCz;
    const len = Math.hypot(outX, outZ) || 1;
    pushTuft(
      pt[0] + (outX / len) * range(1.0, 2.2),
      pt[1] + (outZ / len) * range(1.0, 2.2),
      range(0.55, 0.92),
      range(1.55, 2.0),
      i % 2 === 0 ? "plume-grass" : "dry-grass"
    );
  }

  const resolved: OilPaintAutumnLayout = { water, stones, proceduralPlants };
  layoutCache.set(seed, resolved);
  return resolved;
}

const DEFAULT_LAYOUT = resolveOilPaintAutumn(templateBaseSeed("oil-paint"));

export const OIL_PAINT_LAKE_SHORELINE: Point[] = DEFAULT_LAYOUT.water[0].shoreline!.map(([x, z]) => [x, z] as Point);
export const OIL_PAINT_ROCKS: NonNullable<WorldTemplateArtDirection["stones"]> = DEFAULT_LAYOUT.stones;
export const OIL_PAINT_WATER: NonNullable<WorldTemplateArtDirection["water"]> = DEFAULT_LAYOUT.water;
export const OIL_PAINT_PROCEDURAL_PLANTS: TemplateProceduralPlantInstance[] = DEFAULT_LAYOUT.proceduralPlants;
