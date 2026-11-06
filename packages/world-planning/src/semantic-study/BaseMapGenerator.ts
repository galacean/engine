import { applySizeCoupling } from "./BaseMapSizeCoupling";
import { compileShape, editShape, connectorBlock, type ShapeRecipe, type ShapeEdits } from "./ComposedShape";
import type { IslandPlan, PlanPoint, PlanRock, PlanMountain, PlanWater } from "./IslandPlanModel";
import { envelope, regionShape, slopeBand } from "./IslandPlanAtoms";

/** Bounded controls for one image-guided composition; all distances compile to world metres. */
export interface BaseMapParameters {
  landWidth: number;
  coastRoundness: number;
  riverWidth: number;
  riverBend: number;
  lakeSize: number;
  rangeWidth: number;
  rangeLength: number;
  rangeHeight: number;
  rangeYaw: number;
  forkSpread: number;
  shoulderWidth: number;
  saddleGap: number;
  valleyGap: number;
  villageSize: number;
  buildingCount: number;
  islandCount: number;
  seed: number;
}
/** Initial intent fitted to the approved contour reference, not a per-rock placement list. */
export const BASE_MAP_DEFAULTS: BaseMapParameters = {
  landWidth: 1,
  coastRoundness: 0.65,
  riverWidth: 1,
  riverBend: 1,
  lakeSize: 1,
  rangeWidth: 1,
  rangeLength: 1,
  rangeHeight: 1,
  rangeYaw: 0,
  forkSpread: 1,
  shoulderWidth: 1,
  saddleGap: 1,
  valleyGap: 1,
  villageSize: 1,
  buildingCount: 6,
  islandCount: 1,
  seed: 1729
};
/** UI and generator share the same legal parameter ranges. */
export const BASE_MAP_CONTROLS: {
  key: Exclude<keyof BaseMapParameters, "seed">;
  label: string;
  group: string;
  min: number;
  max: number;
  step: number;
  unit: string;
}[] = [
  { key: "landWidth", label: "陆地宽阔度", group: "岛岸与水系", min: 0.94, max: 1.04, step: 0.01, unit: "倍" },
  { key: "coastRoundness", label: "岸线圆润度", group: "岛岸与水系", min: 0.15, max: 1, step: 0.01, unit: "" },
  { key: "riverWidth", label: "河道宽度", group: "岛岸与水系", min: 0.65, max: 1.35, step: 0.01, unit: "倍" },
  { key: "riverBend", label: "河道弯曲度", group: "岛岸与水系", min: 0.65, max: 1.2, step: 0.01, unit: "倍" },
  { key: "lakeSize", label: "源头湖面积", group: "岛岸与水系", min: 0.7, max: 1.25, step: 0.01, unit: "倍" },
  { key: "rangeWidth", label: "连续山群厚度", group: "沿谷连续山群", min: 0.7, max: 1.15, step: 0.01, unit: "倍" },
  { key: "rangeLength", label: "沿谷延伸长度", group: "沿谷连续山群", min: 0.8, max: 1.04, step: 0.01, unit: "倍" },
  { key: "rangeHeight", label: "峰高起伏", group: "沿谷连续山群", min: 0.6, max: 1.5, step: 0.01, unit: "倍" },
  { key: "rangeYaw", label: "延伸方向", group: "沿谷连续山群", min: -5, max: 5, step: 0.5, unit: "°" },
  { key: "forkSpread", label: "山群分叉展开", group: "分叉山群与谷地", min: 0.75, max: 1.15, step: 0.01, unit: "倍" },
  { key: "shoulderWidth", label: "山肩展开宽度", group: "分叉山群与谷地", min: 0.7, max: 1.1, step: 0.01, unit: "倍" },
  { key: "saddleGap", label: "鞍部开口", group: "分叉山群与谷地", min: 0.7, max: 1.35, step: 0.01, unit: "倍" },
  { key: "valleyGap", label: "两山群间距", group: "分叉山群与谷地", min: 0.9, max: 1.12, step: 0.01, unit: "倍" },
  { key: "villageSize", label: "村落占地面积", group: "村落与离岸岛", min: 0.75, max: 1.3, step: 0.01, unit: "倍" },
  { key: "buildingCount", label: "建筑数量", group: "村落与离岸岛", min: 3, max: 8, step: 1, unit: "栋" },
  { key: "islandCount", label: "离岸小岛数量", group: "村落与离岸岛", min: 1, max: 3, step: 1, unit: "座" }
];
const WORLD = 2048;
const p = (x: number, z: number): PlanPoint => ({ x: x * WORLD, z: z * WORLD });
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const mix = (a: PlanPoint, b: PlanPoint, t: number): PlanPoint => ({ x: lerp(a.x, b.x, t), z: lerp(a.z, b.z, t) });
const distance = (a: PlanPoint, b: PlanPoint) => Math.hypot(a.x - b.x, a.z - b.z);
const noise = (seed: number, i: number) => {
  const v = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453;
  return v - Math.floor(v);
};

/** Smooth internal anchors into a boundary sampled at about eight metres, independently of heightmap density. */
export function samplePlanCurve(anchors: PlanPoint[], closed = false): PlanPoint[] {
  const result: PlanPoint[] = [];
  const at = (i: number) =>
    anchors[closed ? (i + anchors.length) % anchors.length : Math.max(0, Math.min(anchors.length - 1, i))];
  for (let i = 0; i < (closed ? anchors.length : anchors.length - 1); i++) {
    const a = at(i - 1),
      b = at(i),
      c = at(i + 1),
      d = at(i + 2),
      steps = Math.max(2, Math.ceil(distance(b, c) / 8));
    for (let j = 0; j < steps; j++) {
      const t = j / steps,
        t2 = t * t,
        t3 = t2 * t;
      const f = (k: "x" | "z") =>
        0.5 *
        (2 * b[k] +
          (-a[k] + c[k]) * t +
          (2 * a[k] - 5 * b[k] + 4 * c[k] - d[k]) * t2 +
          (-a[k] + 3 * b[k] - 3 * c[k] + d[k]) * t3);
      result.push({ x: f("x"), z: f("z") });
    }
  }
  if (!closed) result.push(anchors.at(-1)!);
  return result;
}
/** Sweeps a variable-width strip around a curve; emits both banks as a single footprint. */
export function sweepPlanBand(points: PlanPoint[], widths: number[]): PlanPoint[] {
  const left: PlanPoint[] = [],
    right: PlanPoint[] = [];
  points.forEach((v, i) => {
    const a = points[Math.max(0, i - 1)],
      b = points[Math.min(points.length - 1, i + 1)],
      length = distance(a, b) || 1,
      r = widths[i] / 2;
    const nx = -(b.z - a.z) / length,
      nz = (b.x - a.x) / length;
    left.push({ x: v.x + nx * r, z: v.z + nz * r });
    right.push({ x: v.x - nx * r, z: v.z - nz * r });
  });
  return [...left, ...right.reverse()];
}
/** Shape description for a continuous, asset-independent mountain limb. */
export interface MountainLimb {
  axis: PlanPoint[];
  width: number;
  heights: number[];
  phase: number;
}
/** Fits an outer OBB around an actual footprint in the limb direction. */
function fitRock(id: string, groupId: string, outline: PlanPoint[], yaw: number, height: number): PlanRock {
  const cs = Math.cos(yaw),
    sn = Math.sin(yaw),
    local = outline.map((v) => ({ x: v.x * cs + v.z * sn, z: -v.x * sn + v.z * cs }));
  const minX = Math.min(...local.map((v) => v.x)),
    maxX = Math.max(...local.map((v) => v.x)),
    minZ = Math.min(...local.map((v) => v.z)),
    maxZ = Math.max(...local.map((v) => v.z));
  const x = (minX + maxX) / 2,
    z = (minZ + maxZ) / 2,
    center = { x: x * cs - z * sn, z: x * sn + z * cs },
    width = maxX - minX + 2,
    depth = maxZ - minZ + 2;
  return {
    id,
    groupId,
    outline,
    yaw,
    center,
    width,
    depth,
    height,
    role: height > 95 ? "peak" : "shoulder",
    obb: envelope(center, width, depth, yaw)
  };
}
/** Generates joining rock footprints and exact outer envelopes along one or more mountain axes. */
export function mountainFromLimbs(
  id: string,
  label: string,
  limbs: MountainLimb[]
): { group: PlanMountain; rocks: PlanRock[] } {
  const rocks: PlanRock[] = [],
    envelopes: PlanPoint[][] = [];
  limbs.forEach((limb, branch) => {
    const axis = samplePlanCurve(limb.axis),
      total = axis.slice(1).reduce((s, v, i) => s + distance(v, axis[i]), 0);
    const count = Math.max(2, Math.round(total / (limb.width * 0.58))),
      step = (axis.length - 1) / count;
    const widthAt = (t: number) =>
      limb.width * (0.76 + 0.16 * Math.sin(t * Math.PI) + 0.09 * Math.sin(t * Math.PI * 5 + limb.phase));
    for (let i = 0; i < count; i++) {
      const lo = Math.max(0, Math.floor((i - 0.18) * step)),
        hi = Math.min(axis.length - 1, Math.ceil((i + 1 + 0.18) * step));
      const slice = axis.slice(lo, hi + 1),
        widths = slice.map(
          (_, j) =>
            widthAt((lo + j) / (axis.length - 1)) *
            (0.95 + 0.04 * Math.sin((j / slice.length) * Math.PI * 4 + limb.phase))
        );
      // Taper caps slightly; adjacent rocks still share a short overlap rather than identical intersecting boxes.
      for (let j = 0; j < widths.length; j++) {
        const t = j / Math.max(1, widths.length - 1),
          cap = Math.sqrt(Math.min(1, t / 0.18, (1 - t) / 0.18));
        widths[j] *= (0.3 + 0.7 * cap) * (1 + 0.08 * Math.sin(t * Math.PI * 3 + i * 0.9));
      }
      const footprint = sweepPlanBand(slice, widths),
        a = slice[0],
        b = slice.at(-1)!;
      const t = i / Math.max(1, count - 1),
        hIndex = t * (limb.heights.length - 1),
        h = lerp(limb.heights[Math.floor(hIndex)], limb.heights[Math.ceil(hIndex)], hIndex % 1);
      rocks.push(fitRock(`${id}-${branch}-${i}`, id, footprint, Math.atan2(b.z - a.z, b.x - a.x), h));
    }
    envelopes.push(
      sweepPlanBand(
        axis,
        axis.map((_, i) => widthAt(i / (axis.length - 1)) + 38)
      )
    );
  });
  // Separate limb boundaries preserve fork/saddle openings; a convex hull would erase these spaces.
  return { group: { id, label, outline: envelopes[0], outlines: envelopes, rockIds: rocks.map((r) => r.id) }, rocks };
}
/** Resolves the selected reference composition through shape/volume APIs; excludes route and director intent. */
export function generateBaseMap(overrides: Partial<BaseMapParameters> = {}, shapeEdits: ShapeEdits = {}): IslandPlan {
  const q = { ...BASE_MAP_DEFAULTS, ...overrides };
  for (const c of BASE_MAP_CONTROLS)
    q[c.key] = Math.max(c.min, Math.min(c.max, Number.isFinite(q[c.key]) ? q[c.key] : BASE_MAP_DEFAULTS[c.key]));
  q.buildingCount = Math.round(q.buildingCount);
  q.islandCount = Math.round(q.islandCount);
  const shapeRecipes: ShapeRecipe[] = [];
  const resolve = (recipe: ShapeRecipe) => {
    const entry = shapeEdits[recipe.id];
    const edited = editShape(
      recipe,
      entry?.semantic ? { [recipe.id]: { ...entry, semantic: { ...entry.semantic, size: 1 } } } : shapeEdits
    );
    shapeRecipes.push(edited);
    const rings = compileShape(edited);
    if (rings.length !== 1) throw new Error(`${recipe.label}的组件需要相互连接`);
    return rings[0];
  };
  const land = resolve({
    id: "land-main",
    label: "主岛",
    rounding: 40 + q.coastRoundness * 160,
    blocks: [
      [0.29, 0.4, 0.43, 0.6, -5],
      [0.51, 0.39, 0.4, 0.64, -12],
      [0.68, 0.47, 0.4, 0.49, -28],
      [0.8, 0.52, 0.25, 0.31, -30],
      [0.38, 0.66, 0.43, 0.24, 26],
      [0.51, 0.76, 0.22, 0.27, -28],
      [0.68, 0.69, 0.26, 0.25, 18]
    ].map(([x, z, w, l, yaw], i) => ({
      id: `land-block-${i}`,
      x: (0.5 + (x - 0.5) * q.landWidth) * WORLD,
      z: z * WORLD,
      width: w * WORLD * q.landWidth,
      length: l * WORLD,
      yaw
    }))
  });
  const riverAnchors = [
    [0.43, 0.15],
    [0.43, 0.195],
    [0.405, 0.23],
    [0.45, 0.28],
    [0.425, 0.33],
    [0.46, 0.385],
    [0.455, 0.43],
    [0.48, 0.48],
    [0.52, 0.53],
    [0.515, 0.59],
    [0.565, 0.615],
    [0.62, 0.635],
    [0.665, 0.62],
    [0.73, 0.63],
    [0.795, 0.66],
    [0.86, 0.68],
    [0.91, 0.67],
    [0.95, 0.675]
  ];
  const riverAxis = samplePlanCurve(
    riverAnchors.map(([x, z], i) => p(i < 10 ? 0.445 + (x - 0.445) * q.riverBend : x, z))
  );
  const stationWidths = [28, 32, 24, 34, 40, 58, 106, 55, 61, 46, 42, 88, 110, 100, 83, 84, 72, 112];
  const river: PlanWater = {
    id: "valley-river",
    label: "曲折河谷水域",
    kind: "river",
    from: "source-lake",
    to: "ocean",
    centerline: riverAxis,
    outline: resolve({
      id: "valley-river",
      label: "主河",
      rounding: 90,
      blocks: riverAnchors.slice(1).map((v, i) => {
        const at = (j: number) =>
          p(j < 10 ? 0.445 + (riverAnchors[j][0] - 0.445) * q.riverBend : riverAnchors[j][0], riverAnchors[j][1]);
        return connectorBlock(
          `river-block-${i}`,
          at(i),
          at(i + 1),
          ((stationWidths[i] + stationWidths[i + 1]) / 2) * q.riverWidth
        );
      })
    })
  };
  const lakeCenter = riverAxis[0],
    lake = resolve({
      id: "source-lake",
      label: "源头湖",
      rounding: 90,
      blocks: [
        {
          id: "lake-block-0",
          x: lakeCenter.x,
          z: lakeCenter.z - 40,
          width: 210 * Math.sqrt(q.lakeSize),
          length: 160 * Math.sqrt(q.lakeSize),
          yaw: 15
        },
        {
          id: "lake-block-1",
          x: lakeCenter.x - 55,
          z: lakeCenter.z - 30,
          width: 130 * Math.sqrt(q.lakeSize),
          length: 140 * Math.sqrt(q.lakeSize),
          yaw: -25
        }
      ]
    });
  const confluence = riverAxis[Math.round(riverAxis.length * 0.13)];
  const tributaryAxis = samplePlanCurve([
    p(0.345, 0.21),
    p(0.365, 0.232),
    { x: confluence.x - 45, z: confluence.z - 14 },
    confluence
  ]);
  const waters: PlanWater[] = [
    { id: "source-lake", label: "山间源头湖", kind: "source", outline: lake },
    river,
    {
      id: "tributary",
      label: "汇入支流",
      kind: "river",
      from: "valley-source",
      to: "valley-river",
      centerline: tributaryAxis,
      outline: resolve({
        id: "tributary",
        label: "支流",
        rounding: 28,
        blocks: [p(0.345, 0.21), p(0.365, 0.232), { x: confluence.x - 45, z: confluence.z - 14 }, confluence]
          .slice(1)
          .map((v, i, arr) =>
            connectorBlock(`tributary-block-${i}`, i ? arr[i - 1] : p(0.345, 0.21), v, (14 + i * 5) * q.riverWidth)
          )
      })
    }
  ];
  const westCenter = p(0.195, 0.415),
    yaw = (q.rangeYaw * Math.PI) / 180;
  const westAxis = [
    [0.205, 0.14],
    [0.175, 0.245],
    [0.18, 0.35],
    [0.165, 0.465],
    [0.18, 0.565],
    [0.235, 0.66]
  ].map(([x, z]) => {
    const v = p(x, z),
      dx = v.x - westCenter.x,
      dz = (v.z - westCenter.z) * q.rangeLength;
    return {
      x: westCenter.x + dx * Math.cos(yaw) - dz * Math.sin(yaw) - (q.valleyGap - 1) * 180,
      z: westCenter.z + dx * Math.sin(yaw) + dz * Math.cos(yaw)
    };
  });
  const west = mountainFromLimbs("continuous-range", "沿谷连续山群", [
    { axis: westAxis, width: 300 * q.rangeWidth, heights: [145, 126, 102, 78], phase: q.seed * 0.001 }
  ]);
  const pivot = p(0.66, 0.32),
    transform = (a: number[][]) =>
      a.map(([x, z]) => {
        const v = p(x, z);
        return { x: pivot.x + (v.x - pivot.x) * q.forkSpread + (q.valleyGap - 1) * 160, z: v.z };
      });
  const gap = (q.saddleGap - 1) * 0.055;
  const east = mountainFromLimbs("forked-range", "山肩 · 分叉山群", [
    {
      axis: transform([
        [0.57, 0.12],
        [0.605, 0.205],
        [0.585, 0.27],
        [0.62, 0.34],
        [0.69 - gap, 0.425]
      ]),
      width: 245,
      heights: [165, 135, 100, 74],
      phase: 1
    },
    {
      axis: transform([
        [0.605, 0.2],
        [0.69, 0.245],
        [0.74, 0.3 - gap]
      ]),
      width: 160 * q.shoulderWidth,
      heights: [115, 92, 68],
      phase: 3
    },
    {
      axis: transform([
        [0.815 + gap, 0.335],
        [0.84, 0.405],
        [0.875, 0.495],
        [0.91, 0.535]
      ]),
      width: 210 * q.shoulderWidth,
      heights: [120, 100, 75],
      phase: 2
    }
  ]);
  west.rocks.forEach((r) => (r.height *= q.rangeHeight));
  const villageCenter = p(0.73, 0.735),
    villageOutline = regionShape(villageCenter, 235 * Math.sqrt(q.villageSize), 178 * Math.sqrt(q.villageSize), 0.8, 2);
  const buildings = Array.from({ length: q.buildingCount }, (_, i) => {
    const angle = -Math.PI * 0.7 + (i / q.buildingCount) * Math.PI * 2,
      scale = Math.sqrt(q.villageSize);
    const center = {
      x: villageCenter.x + Math.cos(angle) * 66 * scale,
      z: villageCenter.z + Math.sin(angle) * 44 * scale
    };
    const w = 27 + (i % 2) * 10,
      d = 23 + (i % 3) * 4,
      yaw = ((i % 3) - 1) * 0.35;
    return {
      id: `village-building-${i}`,
      regionId: "village",
      center,
      width: w,
      depth: d,
      height: 8 + (i % 3) * 3,
      yaw,
      outline: envelope(center, w, d, yaw)
    };
  });
  const islands: PlanPoint[][] = [],
    islandRocks: PlanRock[] = [],
    islandRegions: IslandPlan["regions"] = [];
  for (let i = 0; i < q.islandCount; i++) {
    const sites = [
        [0.865, 0.9],
        [0.12, 0.845],
        [0.76, 0.93]
      ],
      center = p(sites[i][0] + (noise(q.seed, i) - 0.5) * 0.012, sites[i][1]),
      island = resolve({
        id: `offshore-${i}`,
        label: `离岸岛屿 ${i + 1}`,
        rounding: 65,
        blocks: [
          { id: `island-${i}-body`, x: center.x, z: center.z, width: 130 - i * 15, length: 125 - i * 12, yaw: 22 },
          {
            id: `island-${i}-arm`,
            x: center.x + 35,
            z: center.z + 23,
            width: 100 - i * 12,
            length: 88 - i * 8,
            yaw: -28
          }
        ]
      });
    islands.push(island);
    islandRegions.push({ id: `offshore-${i}`, label: `离岸岛屿 ${i + 1}`, kind: "island", outline: island });
    const limb = mountainFromLimbs(`island-rocks-${i}`, "离岸岩体", [
      {
        axis: [
          { x: center.x - 25, z: center.z - 30 },
          { x: center.x + 32, z: center.z + 26 }
        ],
        width: 78 - i * 8,
        heights: [42, 24],
        phase: i
      }
    ]);
    islandRocks.push(...limb.rocks);
  }
  return applySizeCoupling(
    {
      shapeRecipes,
      mode: "base-map",
      parameters: {
        width: WORLD,
        depth: WORLD,
        valleyWidth: q.valleyGap,
        riverWidth: q.riverWidth,
        mountainHeight: q.rangeHeight,
        seed: q.seed
      },
      land,
      islands,
      rocks: [...west.rocks, ...east.rocks, ...islandRocks],
      mountains: [west.group, east.group],
      waters,
      routes: [],
      places: [],
      bridges: [],
      sights: [],
      ridges: [],
      supports: [],
      spawn: p(0, 0),
      buildings,
      regions: [{ id: "village", label: "临水村落", kind: "village", outline: villageOutline }, ...islandRegions],
      slopes: [
        slopeBand("coast-soil", "海岸泥土缓坡", land, 24, true),
        ...islands.map((b, i) => slopeBand(`island-slope-${i}`, "岛岸泥土缓坡", b, 14, true)),
        ...waters.map((w) => slopeBand(`bank-${w.id}`, "河湖泥土缓坡", w.outline, 16, false))
      ],
      raster: { heightSamples: 1025, alphaSamples: 1024, spacing: 2 },
      prompt:
        "连续山群沿曲折河谷延伸；分叉山群形成山肩和鞍部；村落临近下游水域；离岸岛屿与主岛分离。点线面体与相邻关系构成空间底图，不预设出生点、通路或视线。"
    },
    shapeEdits
  );
}
