import { naturalTreeDimensions } from "../planning-data/NaturalVegetationProfile";
import type { IslandPlan, PlanLandscape, PlanRock, PlanPoint } from "./IslandPlanModel";
import type { PoiSite, PoiTier } from "./PoiDistribution";
import type { PlanningModule, SemanticEdit } from "./WorldPlanningContract";
import { composeRockGroup } from "../landforms/RockComposition";
import { ROCK_ATOMS, type AtomKind } from "../landforms/RockAtoms";
import { unionRectangles } from "./ComposedShape";
import { envelope } from "./IslandPlanAtoms";
import { settlementRandom as random } from "./SettlementGeometry";
import { poiTreeHeight } from "./PoiTrees";

export interface PoiContentRecipe {
  id: string;
  label: string;
  algorithm: string;
  tiers: string[];
  weight: number;
  parameters: Record<string, unknown>;
}
export interface PoiPopulationConfig {
  version: number;
  fit: { attemptsPerScale: number; scales: number[]; maxOffsetM: number };
  recipes: PoiContentRecipe[];
}
export interface PoiContentContext {
  plan: IslandPlan;
  landscape: import("./ContextLandscape").LandscapeConfig;
  site: PoiSite;
  recipe: PoiContentRecipe;
  origin: PlanPoint;
  scale: number;
  edits: Record<string, SemanticEdit>;
  ground: (p: PlanPoint) => number;
}
export interface PoiContentCandidate {
  footprints: PlanPoint[][];
  rocks: PlanRock[];
  mountains: IslandPlan["mountains"];
  landscapes: PlanLandscape[];
  modules: PlanningModule[];
  members: string[];
}
export interface PoiContentAlgorithm {
  validate(parameters: Record<string, unknown>): void;
  generate(context: PoiContentContext): PoiContentCandidate;
  nominalSpan(context: PoiContentContext): number;
}
const algorithms = new Map<string, PoiContentAlgorithm>();
/** Add a generation capability once. Recipe variants contain only data and require no editor branches. */
export function registerPoiContentAlgorithm(id: string, algorithm: PoiContentAlgorithm): () => void {
  if (algorithms.has(id)) throw new Error(`重复的POI算法：${id}`);
  algorithms.set(id, algorithm);
  return () => {
    algorithms.delete(id);
  };
}
/** Registry identity for the main/Worker contract; generation stays in the registered algorithms. */
export function registeredPoiContentAlgorithms(): string[] {
  return [...algorithms.keys()].sort();
}
export function contentAlgorithm(id: string): PoiContentAlgorithm {
  const a = algorithms.get(id);
  if (!a) throw new Error(`未注册POI算法：${id}`);
  return a;
}
/** Stable weighted race: recipe array order has no effect, and adding a variant does not reseed other geometry. */
export function rankedPoiRecipes(config: PoiPopulationConfig, seed: number, site: PoiSite): PoiContentRecipe[] {
  return config.recipes
    .filter((r) => r.tiers.includes(site.tier) && r.weight > 0)
    .sort((a, b) => {
      const score = (r: PoiContentRecipe) =>
        -Math.log(Math.max(1e-10, random(seed, `${site.id}:recipe:${r.id}`))) / r.weight;
      return score(a) - score(b) || a.id.localeCompare(b.id);
    });
}
const empty = (): PoiContentCandidate => ({
  footprints: [],
  rocks: [],
  mountains: [],
  landscapes: [],
  modules: [],
  members: []
});
function range(c: PoiContentContext, key: string): number {
  const v = c.recipe.parameters[key] as number[];
  if (!Array.isArray(v) || v.length !== 2 || !v.every(Number.isFinite) || v[0] <= 0 || v[1] < v[0])
    throw new Error(`配方${c.recipe.id}的${key}范围无效`);
  return v[0] + random(c.plan.parameters.seed, `${c.site.id}:${c.recipe.id}:${key}`) * (v[1] - v[0]);
}
function validRange(q: Record<string, unknown>, key: string): number[] {
  const v = q[key] as number[];
  if (!Array.isArray(v) || v.length !== 2 || !v.every(Number.isFinite) || v[0] <= 0 || v[1] < v[0])
    throw new Error(`POI配方的${key}范围无效`);
  return v;
}
function validNumber(q: Record<string, unknown>, key: string, min: number, max: number) {
  const v = q[key];
  if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max) throw new Error(`POI配方的${key}无效`);
}
registerPoiContentAlgorithm("rock-group", {
  validate(q) {
    validRange(q, "lengthM");
    validRange(q, "heightM");
    const counts = validRange(q, "atoms");
    if (counts.some((n) => !Number.isInteger(n) || n < 2 || n > 12)) throw new Error("岩群原子数量必须在2到12之间");
    if (!Array.isArray(q.profiles) || !q.profiles.length || q.profiles.some((k) => !Object.hasOwn(ROCK_ATOMS, k)))
      throw new Error("岩群形状配方无效");
    validNumber(q, "variation", 0, 1);
    if (q.landingMinimumWidthM !== undefined) validNumber(q, "landingMinimumWidthM", 1, 10);
  },
  nominalSpan: (c) => c.edits[`content-${c.site.id}`]?.lengthM ?? range(c, "lengthM"),
  generate(c) {
    const id = `content-${c.site.id}`,
      edit = c.edits[id] ?? {},
      seed = c.plan.parameters.seed;
    const lengthM = edit.lengthM ?? range(c, "lengthM"),
      heightM = edit.heightM ?? range(c, "heightM"),
      yawDegrees = edit.yawDegrees ?? random(seed, `${id}:yaw`) * 360,
      variation = edit.variation ?? Number(c.recipe.parameters.variation);
    const profiles = c.recipe.parameters.profiles as AtomKind[];
    const atoms = composeRockGroup(seed, c.recipe.id + ":" + c.site.id, {
      lengthM,
      heightM,
      count: Math.round(range(c, "atoms")),
      variation,
      profiles,
      landingMinimumWidthM:
        c.recipe.parameters.landingMinimumWidthM === undefined
          ? undefined
          : Number(c.recipe.parameters.landingMinimumWidthM) / c.scale
    });
    if (!atoms.length) return empty();
    const yaw = (yawDegrees * Math.PI) / 180,
      cos = Math.cos(yaw),
      sin = Math.sin(yaw);
    const transform = (p: PlanPoint) => ({
      x: c.origin.x + c.scale * (cos * p.x - sin * p.z),
      z: c.origin.z + c.scale * (sin * p.x + cos * p.z)
    });
    const result = empty();
    result.rocks = atoms.map((a, i) => {
      const p = transform({ x: a.x, z: a.z }),
        base = c.ground(p),
        outline = envelope(p, a.width * c.scale, a.depth * c.scale, a.yaw + yaw);
      return {
        id: `${id}-atom-${i}`,
        groupId: id,
        center: p,
        width: a.width * c.scale,
        depth: a.depth * c.scale,
        height: a.height,
        baseHeight: base,
        yaw: a.yaw + yaw,
        role: a.kind === "crown" || a.kind === "spire" ? "peak" : a.kind === "buttress/shoulder" ? "shoulder" : "wall",
        outline,
        obb: outline,
        boxes: a.boxes.map((b, j) => ({
          ...b,
          id: `${id}-atom-${i}-${j}`,
          center: transform(b.center),
          sizeX: b.sizeX * c.scale,
          sizeZ: b.sizeZ * c.scale,
          yaw: b.yaw + yaw,
          elevation: base + (b.elevation ?? 0)
        }))
      };
    });
    const outlines = unionRectangles(
      result.rocks.flatMap((r) =>
        r.boxes!.map((b) => ({
          id: b.id,
          x: b.center.x,
          z: b.center.z,
          width: b.sizeX,
          length: b.sizeZ,
          yaw: (b.yaw * 180) / Math.PI
        }))
      ),
      1e-8
    );
    // Upper parts can overhang the nominal atom envelope. Placement and final validation
    // must consume the same physical footprint, including those authored overhangs.
    result.footprints = result.rocks.flatMap((r) => r.boxes!.map((b) => envelope(b.center, b.sizeX, b.sizeZ, b.yaw)));
    result.mountains = [
      {
        id,
        semanticKind: "peaks",
        label: `${{ large: "大", medium: "中", small: "小" }[c.site.tier]}${c.recipe.label} ${Number(c.site.id.split("-").at(-1)) + 1}`,
        outline: outlines[0],
        outlines,
        semanticOutlines: outlines,
        densityOutlines: outlines,
        rockIds: result.rocks.map((r) => r.id)
      }
    ];
    result.modules = [
      {
        id,
        kind: "mountain",
        outline: outlines[0],
        outlines,
        dependencies: [c.site.id],
        memberIds: result.rocks.map((r) => r.id),
        requested: { lengthM, heightM, yawDegrees, variation },
        resolved: {
          originX: c.origin.x,
          originZ: c.origin.z,
          lengthM: lengthM * c.scale,
          height: heightM,
          obbCount: result.rocks.flatMap((r) => r.boxes!).length
        }
      }
    ];
    result.members = [id];
    return result;
  }
});
function landmarkTreeDimensions(c: PoiContentContext) {
  const id = `tree-${c.site.id}`,
    q = c.recipe.parameters;
  const height = poiTreeHeight(c.plan.parameters.seed, id, c.site.id, c.landscape, c.edits, c.site.tier, {
    heightMultiplier: Number(q.heightMultiplier),
    minimumAboveAmbientM: Number(q.minimumAboveAmbientM)
  });
  return naturalTreeDimensions(c.plan.parameters.seed, id, height, c.origin);
}
registerPoiContentAlgorithm("landmark-tree", {
  validate(q) {
    validNumber(q, "heightMultiplier", 1, 10);
    validNumber(q, "minimumAboveAmbientM", 0, 100);
    for (const key of ["trunkWidthRatio", "crownBaseRatio", "crownTopRatio"]) validNumber(q, key, 0.01, 0.99);
  },
  nominalSpan: (c) => {
    const tree = landmarkTreeDimensions(c);
    return Math.max(tree.width, tree.depth);
  },
  generate(c) {
    const result = empty(),
      id = `tree-${c.site.id}`,
      tree = landmarkTreeDimensions(c),
      width = tree.width,
      depth = tree.depth,
      yaw = random(c.plan.parameters.seed, id + "yaw") * Math.PI * 2,
      shape = c.recipe.parameters;
    const h = tree.height;
    const outline = envelope(c.origin, width, depth, yaw);
    result.landscapes = [
      {
        id,
        ownerId: c.site.id,
        poiId: c.site.id,
        sourceId: c.site.id,
        role: "poi",
        context: "poi",
        kind: "tree",
        center: c.origin,
        assetId: tree.assetId,
        width,
        depth,
        height: h,
        yaw,
        baseHeight: c.ground(c.origin),
        outline,
        collisionRadius: (width * Number(shape.trunkWidthRatio)) / 2,
        canopyRadius: width / 2,
        treeShape: {
          trunkWidthRatio: Number(shape.trunkWidthRatio),
          crownBaseRatio: Number(shape.crownBaseRatio),
          crownTopRatio: Number(shape.crownTopRatio)
        },
        heightRule: {
          heightMultiplier: Number(shape.heightMultiplier),
          minimumAboveAmbientM: Number(shape.minimumAboveAmbientM)
        }
      }
    ];
    result.footprints = [outline];
    result.members = [id];
    return result;
  }
});
/** Validate the catalog before generating any content, including extension registrations. */
export function validatePoiCatalog(c: PoiPopulationConfig) {
  if (
    c.version !== 1 ||
    !Number.isFinite(c.fit.maxOffsetM) ||
    c.fit.maxOffsetM < 0 ||
    c.fit.maxOffsetM > 100 ||
    !Number.isInteger(c.fit.attemptsPerScale) ||
    c.fit.attemptsPerScale < 1 ||
    c.fit.attemptsPerScale > 32 ||
    !c.fit.scales.length ||
    c.fit.scales.some((s) => !Number.isFinite(s) || s <= 0 || s > 1)
  )
    throw new Error("POI配方预算无效");
  const ids = new Set<string>();
  for (const r of c.recipes) {
    if (ids.has(r.id) || !r.id || !Number.isFinite(r.weight) || r.weight < 0) throw new Error("POI配方ID或权重无效");
    ids.add(r.id);
    contentAlgorithm(r.algorithm).validate(r.parameters);
  }
  for (const tier of ["large", "medium", "small"] as PoiTier[])
    if (!c.recipes.some((r) => r.tiers.includes(tier) && r.weight > 0)) throw new Error(`${tier}没有可用POI配方`);
}
