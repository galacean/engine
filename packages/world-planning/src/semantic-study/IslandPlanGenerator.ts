import { completePlanAtoms } from "./IslandPlanAtoms";
import type { IslandPlan, IslandPlanParameters, PlanPoint, PlanRock, PlanMountain, PlanRoute } from "./IslandPlanModel";

/** Baseline composition in metres, independent of any heightmap allocation. */
export const DEFAULT_ISLAND_PLAN_PARAMETERS: IslandPlanParameters = {
  width: 2048,
  depth: 2048,
  valleyWidth: 1,
  riverWidth: 26,
  mountainHeight: 1,
  seed: 1729
};

function random(seed: number, index: number): number {
  let h = Math.imul(seed ^ index, 374761393);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function rotate(center: PlanPoint, x: number, z: number, yaw: number): PlanPoint {
  return { x: center.x + x * Math.cos(yaw) - z * Math.sin(yaw), z: center.z + x * Math.sin(yaw) + z * Math.cos(yaw) };
}
function ellipse(center: PlanPoint, rx: number, rz: number, n = 32): PlanPoint[] {
  return Array.from({ length: n }, (_, i) => ({
    x: center.x + rx * Math.cos((i / n) * Math.PI * 2),
    z: center.z + rz * Math.sin((i / n) * Math.PI * 2)
  }));
}
function smooth(points: PlanPoint[], closed = false, subdivisions = 10): PlanPoint[] {
  const result: PlanPoint[] = [],
    count = closed ? points.length : points.length - 1;
  const at = (i: number) =>
    points[closed ? (i + points.length) % points.length : Math.max(0, Math.min(points.length - 1, i))];
  for (let i = 0; i < count; i++) {
    const a = at(i - 1),
      b = at(i),
      c = at(i + 1),
      d = at(i + 2);
    for (let j = 0; j < subdivisions; j++) {
      const t = j / subdivisions,
        t2 = t * t,
        t3 = t2 * t;
      const value = (k: "x" | "z") =>
        0.5 *
        (2 * b[k] +
          (-a[k] + c[k]) * t +
          (2 * a[k] - 5 * b[k] + 4 * c[k] - d[k]) * t2 +
          (-a[k] + 3 * b[k] - 3 * c[k] + d[k]) * t3);
      result.push({ x: value("x"), z: value("z") });
    }
  }
  if (!closed) result.push(points[points.length - 1]);
  return result;
}
function corridor(points: PlanPoint[], width: number, endWidth = width): PlanPoint[] {
  const sides: PlanPoint[][] = [[], []];
  points.forEach((p, i) => {
    const a = points[Math.max(0, i - 1)],
      b = points[Math.min(points.length - 1, i + 1)],
      length = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    const t = i / (points.length - 1);
    const r =
      ((width + (endWidth - width) * t) * (1 + 0.13 * Math.sin(t * Math.PI * 4) + 0.08 * Math.sin(t * Math.PI * 7))) /
      2;
    sides[0].push({ x: p.x - ((b.z - a.z) / length) * r, z: p.z + ((b.x - a.x) / length) * r });
    sides[1].push({ x: p.x + ((b.z - a.z) / length) * r, z: p.z - ((b.x - a.x) / length) * r });
  });
  return [...sides[0], ...sides[1].reverse()];
}
function hull(points: PlanPoint[]): PlanPoint[] {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.z - b.z);
  const cross = (a: PlanPoint, b: PlanPoint, c: PlanPoint) => (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
  const half = (ps: PlanPoint[]) => {
    const out: PlanPoint[] = [];
    for (const p of ps) {
      while (out.length > 1 && cross(out[out.length - 2], out[out.length - 1], p) <= 0) out.pop();
      out.push(p);
    }
    return out;
  };
  return [...half(sorted).slice(0, -1), ...half(sorted.reverse()).slice(0, -1)];
}

/**
 * Assemble a bounded island composition from individually addressed rocks, water reaches and place connections.
 * @param overrides Explicit compositional controls; the baseline is authored, variants preserve its connection graph.
 * @returns Planning geometry in rectangular world metres; physical traversal and visibility require later compilation.
 */
export function generateIslandPlan(overrides: Partial<IslandPlanParameters> = {}): IslandPlan {
  const q = { ...DEFAULT_ISLAND_PLAN_PARAMETERS, ...overrides, width: 2048, depth: 2048 };
  const p = (x: number, z: number): PlanPoint => ({ x: x * q.width, z: z * q.depth });
  const coastVertices = [
    [0.12, 0.15],
    [0.24, 0.09],
    [0.37, 0.12],
    [0.47, 0.1],
    [0.6, 0.08],
    [0.73, 0.13],
    [0.79, 0.23],
    [0.81, 0.34],
    [0.86, 0.44],
    [0.86, 0.57],
    [0.925, 0.7],
    [0.88, 0.84],
    [0.75, 0.89],
    [0.61, 0.87],
    [0.46, 0.93],
    [0.31, 0.89],
    [0.17, 0.84],
    [0.1, 0.72],
    [0.115, 0.59],
    [0.07, 0.47],
    [0.1, 0.32]
  ];
  const land = smooth(
    coastVertices.map(([x, z], i) =>
      p(x + (random(q.seed, i) - 0.5) * 0.025, z + (random(q.seed, i + 50) - 0.5) * 0.025)
    ),
    true
  );
  const rocks: PlanRock[] = [],
    mountains: PlanMountain[] = [];
  // Each tuple is an individual rock, not a raster cell: X, Z, footprint width/depth and relative height.
  const layouts: { id: string; label: string; offshore?: boolean; side: number; items: number[][] }[] = [
    {
      id: "northwest",
      label: "西北崖脊",
      side: -1,
      items: [
        [0.2, 0.23, 0.072, 0.095, 110],
        [0.27, 0.205, 0.077, 0.092, 128],
        [0.33, 0.25, 0.066, 0.079, 100],
        [0.2, 0.33, 0.071, 0.086, 86],
        [0.28, 0.31, 0.072, 0.088, 102],
        [0.345, 0.33, 0.047, 0.082, 64],
        [0.23, 0.4, 0.063, 0.072, 62],
        [0.29, 0.4, 0.059, 0.066, 48],
        [0.17, 0.285, 0.035, 0.05, 54]
      ]
    },
    {
      id: "northeast",
      label: "高脊 · 山肩登高",
      side: 1,
      items: [
        [0.55, 0.205, 0.047, 0.072, 130],
        [0.61, 0.2, 0.061, 0.097, 156],
        [0.68, 0.19, 0.063, 0.077, 144],
        [0.71, 0.275, 0.068, 0.093, 126],
        [0.565, 0.29, 0.049, 0.081, 106],
        [0.615, 0.32, 0.051, 0.071, 94],
        [0.7, 0.37, 0.066, 0.088, 78],
        [0.65, 0.425, 0.056, 0.081, 56],
        [0.585, 0.465, 0.058, 0.075, 38],
        [0.75, 0.32, 0.035, 0.055, 64],
        [0.53, 0.365, 0.041, 0.07, 64]
      ]
    },
    {
      id: "southwest",
      label: "西南岩壁 · 留白边界",
      side: -1,
      items: [
        [0.17, 0.61, 0.055, 0.089, 84],
        [0.23, 0.655, 0.061, 0.093, 76],
        [0.175, 0.715, 0.056, 0.078, 62],
        [0.255, 0.75, 0.064, 0.075, 48],
        [0.305, 0.8, 0.052, 0.061, 30],
        [0.14, 0.67, 0.03, 0.051, 46]
      ]
    },
    {
      id: "southeast",
      label: "南岸台地",
      side: 1,
      items: [
        [0.6, 0.815, 0.063, 0.067, 34],
        [0.7, 0.815, 0.078, 0.068, 38],
        [0.785, 0.805, 0.064, 0.058, 26],
        [0.83, 0.755, 0.035, 0.052, 18],
        [0.55, 0.86, 0.038, 0.037, 16]
      ]
    },
    {
      id: "sea-stack",
      label: "海中山群",
      side: 0,
      offshore: true,
      items: [
        [0.906, 0.23, 0.044, 0.061, 86],
        [0.932, 0.278, 0.029, 0.04, 48],
        [0.88, 0.28, 0.027, 0.042, 30]
      ]
    }
  ];
  for (const [groupIndex, layout] of layouts.entries()) {
    const rockIds: string[] = [];
    for (const [i, item] of layout.items.entries()) {
      const [u, v, w, d, height] = item,
        index = groupIndex * 50 + i;
      const shift = layout.offshore ? 0 : layout.side * (q.valleyWidth - 1) * 0.055;
      const center = p(
        u + shift + (random(q.seed, index + 100) - 0.5) * 0.012,
        v + (random(q.seed, index + 200) - 0.5) * 0.012
      );
      const width = w * q.width * 1.16,
        depth = d * q.depth * 1.12,
        yaw = (random(q.seed, index + 300) - 0.5) * 0.85;
      const id = `${layout.id}-rock-${i + 1}`;
      const corners = [
        [-0.48, -0.22],
        [-0.34, -0.48],
        [0.13, -0.44],
        [0.43, -0.3],
        [0.49, 0.08],
        [0.23, 0.47],
        [-0.15, 0.41],
        [-0.45, 0.27],
        [-0.47, 0.0]
      ];
      const outline = corners.map(([x, z], j) => {
        const r = 0.86 + random(q.seed, index * 11 + j + 400) * 0.14;
        return rotate(center, x * width * r, z * depth * r, yaw);
      });
      const role: PlanRock["role"] =
        height > 120
          ? "peak"
          : height > 80
            ? "wall"
            : height > 45
              ? "shoulder"
              : layout.id === "southeast"
                ? "terrace"
                : "skirt";
      rocks.push({
        id,
        groupId: layout.id,
        center,
        width,
        depth,
        yaw,
        height: height * q.mountainHeight,
        role,
        outline,
        obb: [
          [-0.5, -0.5],
          [0.5, -0.5],
          [0.5, 0.5],
          [-0.5, 0.5]
        ].map(([x, z]) => rotate(center, x * width, z * depth, yaw))
      });
      rockIds.push(id);
    }
    const members = rocks.filter((r) => r.groupId === layout.id),
      center = {
        x: members.reduce((s, r) => s + r.center.x, 0) / members.length,
        z: members.reduce((s, r) => s + r.center.z, 0) / members.length
      };
    const outline = hull(members.flatMap((r) => r.obb)).map((pt) => {
      const dx = pt.x - center.x,
        dz = pt.z - center.z,
        d = Math.hypot(dx, dz) || 1;
      return { x: pt.x + (dx / d) * 16, z: pt.z + (dz / d) * 16 };
    });
    mountains.push({ id: layout.id, label: layout.label, outline, rockIds, offshore: layout.offshore });
  }
  const islands = [smooth(mountains.find((g) => g.id === "sea-stack")!.outline, true)];
  const pool = (center: PlanPoint, rx: number, rz: number, key: number) =>
    smooth(
      ellipse(center, rx, rz, 12).map((pt, i) => {
        const scale = 0.82 + random(q.seed, key + i) * 0.3;
        return { x: center.x + (pt.x - center.x) * scale, z: center.z + (pt.z - center.z) * scale };
      }),
      true,
      4
    );
  const source = p(0.425, 0.18),
    spawn = p(0.42, 0.82),
    lookout = p(0.66, 0.28),
    shore = p(0.66, 0.73),
    next = p(0.79, 0.445),
    saddle = p(0.775, 0.36);
  const riverAnchors = [
    source,
    p(0.405, 0.26),
    p(0.43, 0.34),
    p(0.39, 0.415),
    p(0.43, 0.49),
    p(0.505, 0.575),
    p(0.62, 0.63),
    p(0.745, 0.655),
    p(0.85, 0.705),
    p(0.94, 0.758)
  ];
  const riverLine = smooth(riverAnchors, false, 14);
  const lakeCenter = p(0.848, 0.7);
  const bridgeAt = (id: string, index: number) => {
    const c = riverAnchors[index],
      a = riverAnchors[index - 1],
      b = riverAnchors[index + 1],
      len = Math.hypot(b.x - a.x, b.z - a.z);
    const span = q.riverWidth * (1 + (index / (riverAnchors.length - 1)) * 0.7) + 18;
    const n = { x: ((-(b.z - a.z) / len) * span) / 2, z: (((b.x - a.x) / len) * span) / 2 };
    return {
      id,
      label: id === "valley-bridge" ? "谷口跨越" : "下游跨越",
      a: { x: c.x + n.x, z: c.z + n.z },
      b: { x: c.x - n.x, z: c.z - n.z },
      width: 7,
      riverId: "main-river"
    };
  };
  const bridges = [bridgeAt("valley-bridge", 5), bridgeAt("shore-bridge", 7)];
  const routes: PlanRoute[] = [];
  const route = (
    id: string,
    label: string,
    from: string,
    to: string,
    kind: PlanRoute["kind"],
    anchors: PlanPoint[],
    bridgeIndex?: number
  ) => {
    let points: PlanPoint[];
    if (bridgeIndex !== undefined) {
      const bridge = bridges[bridgeIndex],
        at = anchors.indexOf(bridge.a);
      points = [...smooth(anchors.slice(0, at + 1)), bridge.b, ...smooth(anchors.slice(at + 2)).slice(1)];
    } else points = smooth(anchors);
    routes.push({ id, label, from, to, kind, points, width: kind === "main" ? 5 : 3.5 });
  };
  route(
    "climb",
    "过河 · 山肩登高",
    "spawn",
    "lookout",
    "main",
    [
      spawn,
      p(0.405, 0.73),
      p(0.455, 0.67),
      bridges[0].a,
      bridges[0].b,
      p(0.56, 0.52),
      p(0.565, 0.43),
      p(0.6, 0.39),
      p(0.655, 0.36),
      lookout
    ],
    0
  );
  route("shore-walk", "南岸漫行", "spawn", "shore-place", "shore", [
    spawn,
    p(0.485, 0.79),
    p(0.54, 0.74),
    p(0.6, 0.715),
    shore
  ]);
  route(
    "east-crossing",
    "沿岸 · 下游跨越",
    "shore-place",
    "next-valley",
    "main",
    [shore, p(0.71, 0.725), bridges[1].a, bridges[1].b, p(0.8, 0.58), p(0.82, 0.52), next],
    1
  );
  route("ridge-pass", "山脊 · 鞍部通路", "lookout", "next-valley", "ridge", [
    lookout,
    p(0.67, 0.32),
    p(0.71, 0.33),
    saddle,
    p(0.8, 0.4),
    next
  ]);
  const place = (id: string, label: string, purpose: string, center: PlanPoint, rx: number, rz: number) => ({
    id,
    label,
    purpose,
    center,
    outline: ellipse(center, rx, rz)
  });
  const places = [
    place("spawn", "出生草甸", "开阔起步区，可选择登高或沿岸路线", spawn, 20, 14),
    place("lookout", "高处观景台地", "登高目的地，朝向下一片谷地", lookout, 20, 13),
    place("shore-place", "湖岸停留地", "临水活动区，连接南岸与下游跨越", shore, 27, 16),
    place("next-valley", "下一片谷地", "高脊与沿岸两条路线在此汇合", next, 30, 22)
  ];
  return completePlanAtoms({
    parameters: q,
    land,
    islands,
    rocks,
    mountains,
    bridges,
    routes,
    places,
    spawn,
    regions: [],
    buildings: [],
    ridges: [],
    supports: [],
    slopes: [],
    raster: { heightSamples: 1025, alphaSamples: 1024, spacing: 2 },
    waters: [
      { id: "source-pool", label: "山间源头水池", kind: "source", outline: pool(source, 20, 14, 700) },
      {
        id: "main-river",
        label: "源头 → 谷地 → 入海口",
        kind: "river",
        outline: corridor(riverLine, q.riverWidth, q.riverWidth * 1.7),
        centerline: riverLine,
        from: "source-pool",
        to: "ocean"
      },
      {
        id: "estuary",
        label: "入海湖湾",
        kind: "lake",
        outline: pool(lakeCenter, q.width * 0.052, q.depth * 0.045, 800)
      }
    ],
    sights: [
      { id: "spawn-pull", from: spawn, to: lookout, spread: 12, label: "高处目标" },
      { id: "arrival-next", from: lookout, to: next, spread: 28, label: "下一片谷地" },
      { id: "shore-view", from: shore, to: lakeCenter, spread: 32, label: "水面留白" }
    ],
    prompt:
      "正交俯视的矩形大世界语义规划图。画面全部有明确空间含义：深蓝背景只能是海洋，柔和绿色是不规则岛屿草地，沙色为连续岸线，蓝色为从山间源头经谷地和湖湾汇入海洋的连通水系。海洋环绕完整岛屿，不裁断陆地或河流；允许独立海中山群。山群由一座座灰色岩石组成，每座岩石有不规则实形、稀疏等高轮廓和严格青色旋转矩形OBB；紫色虚线单独表示山群范围。黄色实线表示多条物理动线，桥在河流上且桥面沿道路方向，分别连接出生草甸、高处观景台地、湖岸停留地、下一片谷地，形成登高与沿岸两种选择。洋红虚线与扇形只表示视觉动线意图，不能与道路混淆。山肩、山脊与鞍部组织连续登高，谷地和水面保留负空间；出生地的高处目标是pull，河流和岩壁形成push，抵达后朝向下一片谷地。近中远是相对观察点的空间关系，不画同心圆。无天空、未定义背景、密集支柱或断头河。建筑使用黄色OBB；村落使用橙色虚线范围；缓坡为泥土区域，山脊通路附带倾斜OBB占位。"
  });
}
