import { applyV2LevelDesign } from "./V2LevelDesign";
import type { WorldRecipe, V2GlobalSettings, V2RandomProfile, V2Point } from "../spatial/V2Model.ts";
import { namedRandom, distance } from "./V2Geometry";

/** Editable macro controls; dimensions are metres and headings are degrees. */
export const DEFAULT_V2_GLOBAL: V2GlobalSettings = {
  spawnX: 0,
  spawnZ: 0,
  spawnYaw: 0,
  viewAngle: 65,
  nearDistance: 170,
  middleDistance: 330,
  farDistance: 490,
  relief: 0,
  rolling: 0,
  detail: 4,
  wavelength: 310,
  warp: 60,
  coastWidth: 240,
  lakeWidth: 180,
  lakeLength: 135,
  lakeX: 165,
  lakeZ: 130,
  waterLevel: -4,
  tributaryCount: 3,
  riverWidth: 17,
  riverMeander: 30,
  routeCount: 2,
  routeWidth: 7,
  poiCount: 4,
  nearCount: 4,
  middleCount: 6,
  farCount: 8,
  nearHeight: 22,
  middleHeight: 55,
  farHeight: 95,
  passageWidth: 28,
  pullHeight: 12,
  riverSystemCount: 1,
  seaLevel: -12,
  footprintScale: 1,
  mainRouteCount: 2,
  canyonCount: 1,
  shoreRouteCount: 1,
  passCount: 1,
  ridgeRouteCount: 1,
  crossingCount: 1
};
/** One semantic editor control backed by actual generated layout or observation geometry. */
export interface V2SemanticControl {
  key: keyof V2GlobalSettings;
  section: "composition" | "terrain" | "water" | "routes" | "poi" | "mountains";
  label: string;
  min: number;
  max: number;
  step: number;
  unit: string;
}
const control = (
  key: keyof V2GlobalSettings,
  section: V2SemanticControl["section"],
  label: string,
  min: number,
  max: number,
  step: number,
  unit: string
): V2SemanticControl => ({ key, section, label, min, max, step, unit });
/** Ordered editor metadata; proposal slider ranges do not act as geometry publication gates. */
export const V2_SEMANTIC_CONTROLS: readonly V2SemanticControl[] = [
  control("viewAngle", "composition", "观察视角", 25, 120, 1, "°"),
  control("nearDistance", "composition", "近景分布半径", 80, 230, 5, "m"),
  control("middleDistance", "composition", "中景分布半径", 220, 410, 5, "m"),
  control("farDistance", "composition", "远景分布半径", 380, 600, 5, "m"),
  control("warp", "mountains", "山群错落", 0, 180, 5, "m"),
  control("footprintScale", "mountains", "山群占地", 0.5, 1.6, 0.05, "倍"),
  control("riverSystemCount", "water", "独立水系", 1, 3, 1, "组"),
  control("lakeWidth", "water", "主湖宽度", 60, 300, 5, "m"),
  control("lakeLength", "water", "主湖纵深", 50, 240, 5, "m"),
  control("lakeX", "water", "主湖位置 X", -330, 330, 5, "m"),
  control("lakeZ", "water", "主湖位置 Z", -330, 330, 5, "m"),
  control("waterLevel", "water", "湖面海拔", -15, 10, 0.5, "m"),
  control("seaLevel", "water", "外海海拔", -30, -3, 1, "m"),
  control("tributaryCount", "water", "支流总数", 0, 8, 1, "条"),
  control("riverWidth", "water", "主河宽度", 3, 70, 1, "m"),
  control("riverMeander", "water", "河曲幅度", 0, 90, 2, "m"),
  control("mainRouteCount", "routes", "横贯主线", 1, 4, 1, "条"),
  control("routeCount", "routes", "附加联络支路", 0, 8, 1, "条"),
  control("routeWidth", "routes", "动线宽度", 3, 16, 0.5, "m"),
  control("canyonCount", "routes", "峡谷穿行", 0, 3, 1, "条"),
  control("shoreRouteCount", "routes", "沿岸动线", 0, 3, 1, "条"),
  control("passCount", "routes", "山口穿行", 0, 3, 1, "条"),
  control("ridgeRouteCount", "routes", "山脊登高", 0, 3, 1, "条"),
  control("crossingCount", "routes", "跨越河道", 0, 3, 1, "条"),
  control("poiCount", "poi", "地貌场所数量", 0, 10, 1, "处"),
  control("passageWidth", "poi", "山口与峡谷开口", 12, 90, 1, "m"),
  control("pullHeight", "poi", "地标显著度", 4, 30, 1, "m"),
  control("nearCount", "mountains", "近景山群", 0, 10, 1, "组"),
  control("middleCount", "mountains", "中景山群", 0, 14, 1, "组"),
  control("farCount", "mountains", "远景山群", 0, 18, 1, "组"),
  control("nearHeight", "mountains", "近景山高", 4, 60, 1, "m"),
  control("middleHeight", "mountains", "中景山高", 10, 110, 1, "m"),
  control("farHeight", "mountains", "远景山高", 20, 180, 2, "m")
];

const TAU = Math.PI * 2;
const PROFILES: Record<string, readonly number[]> = {
  "crown/spire": [0.42, 0.62, 0.82, 1, 0.73, 0.55, 0.34],
  wall: [0.75, 0.88, 0.83, 0.94, 0.86, 0.9, 0.72],
  "buttress/shoulder": [1, 0.86, 0.7, 0.54, 0.39, 0.25, 0.14],
  "terrace/cap": [0.42, 0.68, 0.84, 0.84, 0.84, 0.66, 0.4],
  skirt: [0.36, 0.33, 0.28, 0.23, 0.18, 0.13, 0.08]
};
const ROLE_LABELS: Record<string, string> = {
  "crown/spire": "主峰",
  wall: "崖壁",
  "buttress/shoulder": "山肩",
  "terrace/cap": "台地",
  skirt: "山麓"
};
const ROLE_CYCLES = {
  near: ["skirt", "buttress/shoulder", "terrace/cap", "skirt"],
  middle: ["buttress/shoulder", "wall", "buttress/shoulder", "terrace/cap", "crown/spire"],
  far: ["crown/spire", "wall", "buttress/shoulder", "terrace/cap", "skirt", "wall"]
};
function localPoint(center: V2Point, yaw: number, x: number, z: number): V2Point {
  return { x: center.x + Math.cos(yaw) * x - Math.sin(yaw) * z, z: center.z + Math.sin(yaw) * x + Math.cos(yaw) * z };
}
function mixPoint(a: V2Point, b: V2Point, t: number): V2Point {
  return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
}
function macro(seed: number, g: V2GlobalSettings, profile: V2RandomProfile): WorldRecipe {
  const recipe: WorldRecipe = {
    version: 2,
    algorithm: "layout-2.0",
    seed,
    size: 1024,
    resolution: 513,
    alphamapResolution: 512,
    global: { ...g },
    baseHeight: 0,
    roughness: 0,
    noiseScale: 310,
    spawn: { x: 0, z: 0, yaw: 0 },
    player: { radius: 0.65, eyeHeight: 1.7, maxSlope: 0.85, speed: 18 },
    earthworks: { maxCutFill: 45, shoulder: 18 },
    riverScale: 1,
    profile: structuredClone(profile),
    elevations: [],
    riverNodes: [],
    rivers: [],
    lakes: [],
    canyons: [],
    boxes: [],
    pois: [],
    routeNodes: [],
    routes: [],
    views: [],
    groups: []
  };
  const systemCount = Math.max(1, Math.min(3, Math.round(g.riverSystemCount)));
  for (let system = 0; system < systemCount; system++) {
    const angle = (system * TAU) / systemCount;
    const center = localPoint({ x: 0, z: 0 }, angle, g.lakeX, g.lakeZ);
    const scale = system ? 0.82 : 1,
      rx = (g.lakeWidth * scale) / 2,
      rz = (g.lakeLength * scale) / 2;
    const outline = Array.from({ length: 48 }, (_, i) => {
      const t = (i * TAU) / 48,
        phase = namedRandom(seed, `lake.${system}.phase`) * TAU;
      const m = 1 + 0.085 * Math.sin(t * 3 + phase) + 0.04 * Math.sin(t * 5 + 1.3);
      return localPoint(center, angle, Math.cos(t) * rx * m, Math.sin(t) * rz * m);
    });
    recipe.lakes.push({
      id: system ? `lake-${system}` : "lake-main",
      label: `汇流湖盆 ${system + 1}`,
      center,
      radiusX: rx,
      radiusZ: rz,
      yaw: angle,
      level: g.waterLevel - system * 0.4,
      depth: 5,
      irregularity: 0.12,
      outline,
      systemId: `drainage-${system}`
    });
  }
  const bands = [
    {
      key: "near" as const,
      count: g.nearCount,
      height: g.nearHeight,
      radius: g.nearDistance * 0.8,
      width: 82,
      depth: 48
    },
    {
      key: "middle" as const,
      count: g.middleCount,
      height: g.middleHeight,
      radius: (g.nearDistance + g.middleDistance) * 0.53,
      width: 125,
      depth: 70
    },
    {
      key: "far" as const,
      count: g.farCount,
      height: g.farHeight,
      radius: Math.min(440, (g.middleDistance + g.farDistance) * 0.54),
      width: 160,
      depth: 90
    }
  ];
  for (const band of bands)
    for (let i = 0; i < Math.round(band.count); i++) {
      const id = `mountain-${band.key}-${i}`,
        role = ROLE_CYCLES[band.key][i % ROLE_CYCLES[band.key].length];
      const aspect = role === "wall" ? 1.25 : role === "skirt" ? 1.18 : role === "crown/spire" ? 0.82 : 1;
      const width = band.width * g.footprintScale * aspect,
        depth = band.depth * g.footprintScale;
      let theta = ((i + 0.5) * TAU) / Math.max(1, band.count) + (namedRandom(seed, `${id}.angle`) - 0.5) * 0.16;
      // Four open radial corridors persist independently of the initial camera direction.
      const corridorAngle = Math.PI / Math.max(1, g.mainRouteCount);
      const sector = Math.round(theta / corridorAngle),
        offset = theta - sector * corridorAngle;
      const clearanceAngle = Math.min(
        corridorAngle * 0.42,
        (width / 2 + g.passageWidth / 2 + 12) / Math.max(60, band.radius)
      );
      if (Math.abs(offset) < clearanceAngle) theta = sector * corridorAngle + (offset < 0 ? -1 : 1) * clearanceAngle;
      const radius = band.radius + (namedRandom(seed, `${id}.radius`) - 0.5) * g.warp * 0.35;
      const yaw = theta + Math.PI / 2 + (namedRandom(seed, `${id}.yaw`) - 0.5) * 0.3;
      const center = { x: Math.cos(theta) * radius, z: Math.sin(theta) * radius };
      for (const lake of recipe.lakes) {
        const dx = center.x - lake.center.x,
          dz = center.z - lake.center.z;
        const clearance = Math.max(lake.radiusX, lake.radiusZ) + depth * 0.65;
        const d = Math.hypot(dx, dz);
        if (d < clearance) {
          const n = d > 0.01 ? { x: dx / d, z: dz / d } : { x: -Math.sin(theta), z: Math.cos(theta) };
          center.x = lake.center.x + n.x * clearance;
          center.z = lake.center.z + n.z * clearance;
        }
      }
      const extentX = (Math.abs(Math.cos(yaw)) * width + Math.abs(Math.sin(yaw)) * depth) / 2;
      const extentZ = (Math.abs(Math.sin(yaw)) * width + Math.abs(Math.cos(yaw)) * depth) / 2;
      center.x = Math.max(-500 + extentX, Math.min(500 - extentX, center.x));
      center.z = Math.max(-500 + extentZ, Math.min(500 - extentZ, center.z));
      const height = band.height * (0.88 + namedRandom(seed, `${id}.height`) * 0.24);
      const label = `${band.key === "near" ? "近景" : band.key === "middle" ? "中景" : "远景"}${ROLE_LABELS[role]} ${i + 1}`;
      const members: string[] = [];
      const addBox = (suffix: string, x: number, z: number, sx: number, sz: number, h: number) => {
        const boxId = `${id}-${suffix}`;
        recipe.boxes.push({
          id: boxId,
          label: `${label} · ${suffix === "base" ? "连续基座" : "剖面 " + suffix}`,
          center: localPoint(center, yaw, x, z),
          sizeX: sx,
          sizeZ: sz,
          sizeY: Math.max(0.5, h),
          yaw,
          collision: true,
          occlusion: true,
          band: band.key
        });
        members.push(boxId);
      };
      const sequence = PROFILES[role];
      addBox("base", 0, 0, width, depth, height * 0.11);
      for (let j = 0; j < sequence.length; j++) {
        const t = j / (sequence.length - 1);
        const segment = (width / sequence.length) * 1.22;
        addBox(
          String(j),
          (t - 0.5) * (width - segment),
          0,
          segment,
          depth * (0.72 + sequence[j] * 0.22),
          height * sequence[j]
        );
      }
      recipe.groups!.push({
        id,
        label,
        memberIds: members,
        pivot: center,
        translation: { x: 0, z: 0 },
        yaw: 0,
        scale: 1,
        silhouetteRole: role,
        band: band.key,
        envelope: { sizeX: width, sizeZ: depth, height, yaw },
        foundation: { height: height * 0.1, transition: Math.max(50, depth) }
      });
    }
  for (let system = 0; system < systemCount; system++) {
    const lake = recipe.lakes[system],
      systemId = lake.systemId!;
    const sources = recipe
      .groups!.filter((group) => {
        if (group.band === "near") return false;
        const e = group.envelope!,
          dx = lake.center.x - group.pivot.x,
          dz = lake.center.z - group.pivot.z,
          d = Math.max(1, Math.hypot(dx, dz));
        const lx = (Math.cos(e.yaw) * dx + Math.sin(e.yaw) * dz) / d,
          lz = (-Math.sin(e.yaw) * dx + Math.cos(e.yaw) * dz) / d;
        const reach =
          Math.min(e.sizeX / 2 / Math.max(0.0001, Math.abs(lx)), e.sizeZ / 2 / Math.max(0.0001, Math.abs(lz))) + 26;
        const foot = { x: group.pivot.x + (dx / d) * reach, z: group.pivot.z + (dz / d) * reach };
        const fx = foot.x - lake.center.x,
          fz = foot.z - lake.center.z;
        const localX = Math.cos(lake.yaw) * fx + Math.sin(lake.yaw) * fz,
          localZ = -Math.sin(lake.yaw) * fx + Math.cos(lake.yaw) * fz;
        return Math.hypot(localX / (lake.radiusX + 35), localZ / (lake.radiusZ + 35)) > 1;
      })
      .sort((a, b) => {
        const score = (group: typeof a) => {
          const p = group.pivot,
            radial = Math.hypot(p.x, p.z),
            dot =
              (p.x * lake.center.x + p.z * lake.center.z) /
              Math.max(1, radial * Math.hypot(lake.center.x, lake.center.z));
          return dot * 500 + radial - distance(p, lake.center) * 0.25;
        };
        return score(b) - score(a);
      });
    const sourcePoint = (ordinal: number): { point: V2Point; groupId?: string } => {
      const group = sources[ordinal % Math.max(1, sources.length)];
      if (!group) return { point: localPoint(lake.center, lake.yaw, lake.radiusX + 110, (ordinal - 1) * 60) };
      const dx = lake.center.x - group.pivot.x,
        dz = lake.center.z - group.pivot.z,
        d = Math.max(1, Math.hypot(dx, dz));
      const e = group.envelope!,
        lx = (Math.cos(e.yaw) * dx + Math.sin(e.yaw) * dz) / d,
        lz = (-Math.sin(e.yaw) * dx + Math.cos(e.yaw) * dz) / d;
      const reach =
        Math.min(e.sizeX / 2 / Math.max(0.0001, Math.abs(lx)), e.sizeZ / 2 / Math.max(0.0001, Math.abs(lz))) + 26;
      return { point: { x: group.pivot.x + (dx / d) * reach, z: group.pivot.z + (dz / d) * reach }, groupId: group.id };
    };
    const head = sourcePoint(0),
      toward = { x: head.point.x - lake.center.x, z: head.point.z - lake.center.z };
    const d = Math.max(1, Math.hypot(toward.x, toward.z));
    const mouth = {
      x: lake.center.x + (toward.x / d) * Math.min(lake.radiusX, lake.radiusZ) * 0.62,
      z: lake.center.z + (toward.z / d) * Math.min(lake.radiusX, lake.radiusZ) * 0.62
    };
    const junction = mixPoint(head.point, mouth, 0.6),
      headId = `${systemId}:head`,
      junctionId = `${systemId}:join`,
      mouthId = `${systemId}:mouth`;
    recipe.riverNodes.push(
      { id: headId, ...head.point, level: lake.level + 3, sourceGroupId: head.groupId },
      { id: junctionId, ...junction, level: lake.level + 1 },
      { id: mouthId, ...mouth, level: lake.level }
    );
    const addReach = (id: string, aId: string, bId: string, ordinal: number, trunk: boolean) => {
      const a = recipe.riverNodes.find((n) => n.id === aId)!,
        b = recipe.riverNodes.find((n) => n.id === bId)!;
      const dx = b.x - a.x,
        dz = b.z - a.z,
        length = Math.max(1, Math.hypot(dx, dz));
      const controls = [0.25, 0.5, 0.75].map((t, j) => {
        const bend =
          Math.sin((j + 1) * 1.7 + namedRandom(seed, `${id}.bend`) * 2) *
          ((g.riverMeander * length) / (length + Math.max(0, g.riverMeander) * 3));
        return { x: a.x + dx * t - (dz / length) * bend, z: a.z + dz * t + (dx / length) * bend };
      });
      recipe.rivers.push({
        id,
        label: `水系 ${system + 1} · ${trunk ? "主河" : "支流 " + ordinal}`,
        from: aId,
        to: bId,
        controls,
        width: g.riverWidth * (trunk ? 1 : 0.64),
        widthEnd: g.riverWidth * (trunk ? 1.12 : 0.8),
        depth: 2.7,
        bankWidth: 16,
        fitTerrain: true,
        lakeId: lake.id,
        systemId
      });
    };
    addReach(`${systemId}:upper`, headId, junctionId, 0, true);
    addReach(`${systemId}:lower`, junctionId, mouthId, 0, true);
    const count = Math.floor(g.tributaryCount / systemCount) + (system < g.tributaryCount % systemCount ? 1 : 0);
    for (let branch = 0; branch < count; branch++) {
      const source = sourcePoint(branch + 1),
        id = `${systemId}:source-${branch}`;
      const point = source.point;
      recipe.riverNodes.push({ id, ...point, level: lake.level + 3, sourceGroupId: source.groupId });
      addReach(`${systemId}:tributary-${branch}`, id, junctionId, branch + 1, false);
    }
  }
  for (const node of recipe.riverNodes) {
    const sourceGroup = recipe.groups!.find((group) => group.id === node.sourceGroupId);
    if (sourceGroup) sourceGroup.memberIds.push(node.id);
  }
  applyV2LevelDesign(recipe);
  return recipe;
}
/** Create the global connected landscape and editable object graph. @param seed Named random world identity. @param profile Proposal profile persisted with the recipe. @param settings Optional global semantic overrides. @returns Full authoring recipe. */
export function createGlobalRecipe(
  seed: number,
  profile: V2RandomProfile,
  settings: Partial<V2GlobalSettings> = {}
): WorldRecipe {
  return macro(seed, { ...DEFAULT_V2_GLOBAL, ...settings }, profile);
}
/** Read a semantic parameter, including compatible defaults for earlier recipes. @param recipe Current authoring input. @param key Semantic parameter. @returns Value with its declared unit. */
export function getGlobalParameter(recipe: WorldRecipe, key: keyof V2GlobalSettings): number {
  return recipe.global?.[key] ?? DEFAULT_V2_GLOBAL[key];
}
/** Merge a regenerated proposal with authored overrides, matching spatial objects by stable ID. */
export function preserveOverrides(before: unknown, current: unknown, after: unknown): unknown {
  if (JSON.stringify(before) === JSON.stringify(current)) return structuredClone(after);
  if (
    Array.isArray(before) &&
    Array.isArray(current) &&
    Array.isArray(after) &&
    [...before, ...current, ...after].every((v) => v && typeof v === "object" && typeof v.id === "string")
  ) {
    const old = new Map(before.map((v) => [v.id, v])),
      edits = new Map(current.map((v) => [v.id, v]));
    const generated = new Set(after.map((v) => v.id));
    return [
      ...after
        .filter((v) => !old.has(v.id) || edits.has(v.id))
        .map((v) => (edits.has(v.id) ? preserveOverrides(old.get(v.id), edits.get(v.id), v) : structuredClone(v))),
      ...current.filter((v) => !old.has(v.id) && !generated.has(v.id)).map((v) => structuredClone(v))
    ];
  }
  if (
    Array.isArray(before) &&
    Array.isArray(current) &&
    Array.isArray(after) &&
    before.length === current.length &&
    before.length === after.length
  )
    return current.map((value, index) => preserveOverrides(before[index], value, after[index]));
  if (
    before &&
    current &&
    after &&
    typeof before === "object" &&
    typeof current === "object" &&
    typeof after === "object" &&
    !Array.isArray(before) &&
    !Array.isArray(current) &&
    !Array.isArray(after)
  ) {
    const output = { ...(after as Record<string, unknown>) };
    for (const key of Object.keys(current))
      output[key] = preserveOverrides(
        (before as Record<string, unknown>)[key],
        (current as Record<string, unknown>)[key],
        (after as Record<string, unknown>)[key]
      );
    return output;
  }
  return structuredClone(current);
}
/** Rebuild only macro-controlled values while retaining stable authored local overrides. @param recipe Mutable authoring input. @param key Semantic parameter. @param value Requested numeric value. */
export function setGlobalParameter(recipe: WorldRecipe, key: keyof V2GlobalSettings, value: number): void {
  if (!Number.isFinite(value)) throw new Error("语义参数需要有限数值");
  if (
    [
      "riverSystemCount",
      "tributaryCount",
      "routeCount",
      "mainRouteCount",
      "canyonCount",
      "shoreRouteCount",
      "passCount",
      "ridgeRouteCount",
      "crossingCount",
      "poiCount",
      "nearCount",
      "middleCount",
      "farCount"
    ].includes(key) &&
    (!Number.isInteger(value) || value < 0 || value > 64)
  )
    throw new Error("数量需要 0–64 的整数");
  if (key === "riverSystemCount" && (value < 1 || value > 3)) throw new Error("独立水系数量需要 1–3 的整数");
  if (
    [
      "lakeWidth",
      "lakeLength",
      "wavelength",
      "coastWidth",
      "riverWidth",
      "routeWidth",
      "nearDistance",
      "middleDistance",
      "farDistance",
      "passageWidth",
      "pullHeight",
      "footprintScale"
    ].includes(key) &&
    value <= 0
  )
    throw new Error("空间尺度需要正值");
  const oldSettings = { ...DEFAULT_V2_GLOBAL, ...recipe.global },
    nextSettings = { ...oldSettings, [key]: value };
  const oldMacro = macro(recipe.seed, oldSettings, recipe.profile),
    nextMacro = macro(recipe.seed, nextSettings, recipe.profile);
  for (const list of [
    "rivers",
    "riverNodes",
    "lakes",
    "boxes",
    "pois",
    "routes",
    "views",
    "groups",
    "canyons",
    "routeNodes"
  ] as const) {
    const oldItems = oldMacro[list] || [],
      current = recipe[list] || [],
      next = nextMacro[list] || [];
    const oldIds = new Set(oldItems.map((item) => item.id));
    const merged = next.map((item) => {
      const prior = oldItems.find((p) => p.id === item.id),
        edited = current.find((p) => p.id === item.id);
      return prior && edited ? preserveOverrides(prior, edited, item) : item;
    });
    merged.push(...current.filter((item) => !oldIds.has(item.id)));
    (recipe[list] as unknown[]) = merged;
  }
  recipe.spawn = preserveOverrides(oldMacro.spawn, recipe.spawn, nextMacro.spawn) as WorldRecipe["spawn"];
  recipe.global = nextSettings;
  recipe.roughness = 0;
  recipe.noiseScale = 310;
}
