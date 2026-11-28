import { type SeedWorldPlan, type SeedWorldPoint } from "@galacean/engine-world-planning/world/SeedWorldPlanner";
import { type SeedWorldDecorationInstance, type SeedWorldPresentationDecorationInstance } from "@galacean/engine-world-planning/world/SeedWorldDecorations";
import type { SeedWorldPopulationInstance, SeedWorldPopulationPreview } from "@galacean/engine-world-planning/runtime/SeedWorldPopulationPlan";

/** Display-only scale for diagnostic symbols that would be sub-pixel at world scale. */
const SEED_WORLD_MAP_DECORATION_SYMBOL_SCALE = Object.freeze({
  stone: 2.1,
  "small-rock": 1.35,
  mushroom: 2.4,
  lotus: 2.8
} satisfies Readonly<Record<"stone" | "small-rock" | "mushroom" | "lotus", number>>);
const SEED_WORLD_MAP_DECORATION_DRAW_ORDER = Object.freeze({
  rock: 0,
  stone: 1,
  "small-rock": 1,
  mushroom: 2,
  lotus: 3
} satisfies Readonly<Record<SeedWorldPresentationDecorationInstance["category"], number>>);

/**
 * Draws the cached R16 mountain-height field emitted during world compilation.
 * @param context Target map canvas context.
 * @param plan Deterministic world plan owning every displayed intent.
 * @param x Map viewport origin X in CSS pixels.
 * @param y Map viewport origin Y in CSS pixels.
 * @param size Square map viewport size in CSS pixels.
 * @returns Nothing.
 */
export function drawSeedWorldMountainProfiles(
  context: CanvasRenderingContext2D,
  plan: SeedWorldPlan,
  x: number,
  y: number,
  size: number
): void {
  context.drawImage(mountainHeightRaster(plan), x, y, size, size);
}

/**
 * Draws exact accepted rock, debris, mushroom, and lotus footprints produced by the shared compiler.
 * @param context Target map canvas context.
 * @param plan Deterministic world plan owning the displayed instances.
 * @param decorations Exact shared instances; no display-only points are generated here.
 * @param x Map viewport origin X in CSS pixels.
 * @param y Map viewport origin Y in CSS pixels.
 * @param size Square map viewport size in CSS pixels.
 * @returns Nothing.
 */
export function drawSeedWorldDecorations(
  context: CanvasRenderingContext2D,
  plan: SeedWorldPlan,
  decorations: readonly SeedWorldPresentationDecorationInstance[],
  x: number,
  y: number,
  size: number,
  visibleCategories: ReadonlySet<SeedWorldPresentationDecorationInstance["category"]> = new Set([
    "rock",
    "stone",
    "small-rock",
    "mushroom",
    "lotus"
  ])
): void {
  const orderedDecorations = [...decorations].sort(
    (left, right) =>
      SEED_WORLD_MAP_DECORATION_DRAW_ORDER[left.category] - SEED_WORLD_MAP_DECORATION_DRAW_ORDER[right.category]
  );
  for (const decoration of orderedDecorations) {
    if (!visibleCategories.has(decoration.category)) continue;
    const point = mapPoint(decoration.normalizedPosition, x, y, size);
    const rockObbDebris = seedWorldDecorationIsRockObbDebris(decoration);
    const displayScale =
      decoration.category === "rock" || rockObbDebris ? 1 : SEED_WORLD_MAP_DECORATION_SYMBOL_SCALE[decoration.category];
    const minimumSymbolPixels = rockObbDebris
      ? 1.2
      : decoration.category === "stone" && decoration.sourceKind === "lake-outcrop"
        ? 4.5
        : 0;
    const width = Math.max(
      minimumSymbolPixels,
      (decoration.footprintMetres[0] * size * displayScale) / plan.sizeMetres
    );
    const depth = Math.max(
      minimumSymbolPixels,
      (decoration.footprintMetres[1] * size * displayScale) / plan.sizeMetres
    );
    context.save();
    context.translate(point.x, point.y);
    context.rotate(decoration.yawRadians);
    context.beginPath();
    context.moveTo(-width * 0.46, -depth * 0.5);
    context.lineTo(width * 0.42, -depth * 0.43);
    context.lineTo(width * 0.5, depth * 0.34);
    context.lineTo(width * 0.18, depth * 0.5);
    context.lineTo(-width * 0.5, depth * 0.35);
    context.closePath();
    context.fillStyle = decorationFillStyle(decoration);
    context.fill();
    context.strokeStyle = decorationStrokeStyle(decoration);
    context.lineWidth = 0.8;
    context.stroke();
    if (decoration.category === "rock") {
      context.beginPath();
      context.moveTo(0, 0);
      context.lineTo(0, -Math.max(2, depth * 0.45));
      context.strokeStyle = "rgb(57 47 34 / 72%)";
      context.lineWidth = 0.7;
      context.stroke();
    }
    context.restore();
  }
}

function decorationFillStyle(decoration: SeedWorldPresentationDecorationInstance): string {
  if (decoration.category === "rock") return rockFillStyle(decoration.surfaceKind);
  if (seedWorldDecorationIsRockObbDebris(decoration)) return "rgb(255 205 84 / 94%)";
  if (decoration.category === "stone" && decoration.sourceKind === "lake-outcrop") {
    return "rgb(245 191 82 / 96%)";
  }
  if (decoration.category === "mushroom") return "rgb(214 134 91 / 92%)";
  if (decoration.category === "lotus") return "rgb(235 130 185 / 94%)";
  return "rgb(177 164 126 / 92%)";
}

function decorationStrokeStyle(decoration: SeedWorldPresentationDecorationInstance): string {
  if (decoration.category === "rock") return rockStrokeStyle(decoration.surfaceKind);
  if (seedWorldDecorationIsRockObbDebris(decoration)) return "rgb(91 57 14 / 96%)";
  if (decoration.category === "stone" && decoration.sourceKind === "lake-outcrop") {
    return "rgb(88 57 22 / 92%)";
  }
  if (decoration.category === "mushroom") return "rgb(93 51 42 / 82%)";
  if (decoration.category === "lotus") return "rgb(66 106 63 / 90%)";
  return "rgb(70 64 48 / 82%)";
}

function seedWorldDecorationIsRockObbDebris(decoration: SeedWorldPresentationDecorationInstance): boolean {
  return decoration.category === "stone" && decoration.id.startsWith("rock-obb-debris:");
}

/**
 * Draws exact tree/shrub instances and the same Detail density fields used by 3D consumers.
 * @param context Target map canvas context.
 * @param plan Deterministic world plan owning the saved authoring operations.
 * @param preview Shared operation and DensityField output.
 * @param x Map viewport origin X in CSS pixels.
 * @param y Map viewport origin Y in CSS pixels.
 * @param size Square map viewport size in CSS pixels.
 * @param densityCategories Dense Detail fields selected by the diagnostic layer controls.
 * @param instanceCategories Exact woody instance categories selected by the diagnostic layer controls.
 * @returns Nothing.
 */
export function drawSeedWorldPopulationPreview(
  context: CanvasRenderingContext2D,
  _plan: SeedWorldPlan,
  preview: SeedWorldPopulationPreview,
  x: number,
  y: number,
  size: number,
  densityCategories: ReadonlySet<"grass" | "flower"> = new Set(["grass", "flower"]),
  instanceCategories: ReadonlySet<"tree" | "shrub"> = new Set(["tree", "shrub"])
): void {
  context.save();
  if (densityCategories.size > 0) {
    context.imageSmoothingEnabled = true;
    context.globalAlpha = 0.86;
    context.drawImage(detailDensityRaster(preview, densityCategories), x, y, size, size);
  }
  context.globalAlpha = 1;
  for (const instance of preview.treeInstances) {
    if (instance.category !== "tree" && instance.category !== "shrub") continue;
    if (!instanceCategories.has(instance.category)) continue;
    const point = mapPoint(instance.normalizedPosition, x, y, size);
    context.beginPath();
    context.arc(point.x, point.y, populationInstanceMarkerRadius(instance), 0, Math.PI * 2);
    context.fillStyle =
      instance.category === "tree"
        ? treeSpeciesDiagnosticColor(instance.treeSpeciesProfileKey)
        : "rgb(102 151 71 / 76%)";
    context.fill();
    if (instance.category === "tree") {
      context.strokeStyle = treeCohortDiagnosticColor(instance.treeCohortProfileKey);
      context.lineWidth = instance.treeCohortProfileKey === "dominant" ? 1.4 : 0.75;
      context.stroke();
    }
  }
  context.restore();
}

function populationInstanceMarkerRadius(instance: SeedWorldPopulationInstance): number {
  if (instance.category !== "tree") return 0.75;
  return 0.6 + Math.min(1, Math.max(0, (instance.scale[1] - 0.65) / 1.05)) * 2.8;
}

function treeCohortDiagnosticColor(cohort: SeedWorldPopulationInstance["treeCohortProfileKey"]): string {
  if (cohort === "dominant") return "rgb(241 210 99 / 96%)";
  if (cohort === "juvenile") return "rgb(139 216 132 / 92%)";
  return "rgb(222 244 201 / 72%)";
}

function treeSpeciesDiagnosticColor(species: string | undefined): string {
  if (species?.startsWith("fir")) return "rgb(24 92 83 / 88%)";
  if (species?.startsWith("birch")) return "rgb(83 123 64 / 86%)";
  return "rgb(19 79 53 / 82%)";
}

const detailDensityRasterCache = new Map<string, HTMLCanvasElement>();
const FLOWER_DENSITY_COLORS: readonly (readonly [red: number, green: number, blue: number])[] = Object.freeze([
  Object.freeze([198, 103, 190] as const),
  Object.freeze([224, 190, 61] as const),
  Object.freeze([235, 130, 79] as const),
  Object.freeze([110, 171, 220] as const)
]);

function detailDensityRaster(
  preview: SeedWorldPopulationPreview,
  categories: ReadonlySet<"grass" | "flower">
): HTMLCanvasElement {
  const cacheKey = `${preview.hash}:${Number(categories.has("grass"))}:${Number(categories.has("flower"))}`;
  const cached = detailDensityRasterCache.get(cacheKey);
  if (cached) return cached;
  const field = preview.detailDensityFields[0];
  if (!field) throw new Error("Seed World Population preview requires Detail density fields");
  const resolution = Math.min(512, field.resolution);
  const raster = document.createElement("canvas");
  raster.width = resolution;
  raster.height = resolution;
  const rasterContext = raster.getContext("2d");
  if (!rasterContext) throw new Error("Seed World Planner requires a density-field canvas context");
  const pixels = rasterContext.createImageData(resolution, resolution);
  const sources = new Map(preview.detailDensityFields.map((entry) => [entry.prototypeFamily, entry]));
  const grassTargetDensity = preview.detailSpeciesProfiles
    .filter((profile) => profile.category === "grass" && profile.habitat === "terrestrial")
    .reduce((total, profile) => total + profile.targetDensityPerSquareMetre, 0);
  const flowerLayers = preview.detailSpeciesProfiles
    .filter((profile) => profile.category === "flower")
    .map((profile, index) => ({
      field: sources.get(profile.key),
      targetDensityPerSquareMetre: profile.targetDensityPerSquareMetre,
      color: FLOWER_DENSITY_COLORS[index % FLOWER_DENSITY_COLORS.length]!
    }));
  for (let row = 0; row < resolution; row++) {
    const sourceY = Math.min(field.resolution - 1, Math.floor(((row + 0.5) / resolution) * field.resolution));
    for (let column = 0; column < resolution; column++) {
      const sourceX = Math.min(field.resolution - 1, Math.floor(((column + 0.5) / resolution) * field.resolution));
      const index = sourceY * field.resolution + sourceX;
      const pixel = (row * resolution + column) * 4;
      const grass = normalizedCategoryDensity(sources, index, "grass", grassTargetDensity);
      if (categories.has("grass") && grass > 0) {
        const visibleDensity = Math.pow(grass, 1.2);
        pixels.data[pixel] = Math.round(46 + visibleDensity * 38);
        pixels.data[pixel + 1] = Math.round(82 + visibleDensity * 62);
        pixels.data[pixel + 2] = Math.round(40 + visibleDensity * 24);
        pixels.data[pixel + 3] = Math.round(visibleDensity * 104);
      }
      if (categories.has("flower")) {
        blendFlowerDensityColor(pixels.data, pixel, index, flowerLayers);
      }
    }
  }
  rasterContext.putImageData(pixels, 0, 0);
  detailDensityRasterCache.set(cacheKey, raster);
  return raster;
}

function blendFlowerDensityColor(
  pixels: Uint8ClampedArray,
  pixel: number,
  sampleIndex: number,
  layers: readonly {
    readonly field: SeedWorldPopulationPreview["detailDensityFields"][number] | undefined;
    readonly targetDensityPerSquareMetre: number;
    readonly color: readonly [red: number, green: number, blue: number];
  }[]
): void {
  let density = 0;
  let red = 0;
  let green = 0;
  let blue = 0;
  for (const layer of layers) {
    if (!layer.field || layer.targetDensityPerSquareMetre <= 0) continue;
    const layerDensity =
      ((layer.field.samples[sampleIndex]! / 255) * layer.field.maximumDensityPerSquareMetre) /
      layer.targetDensityPerSquareMetre;
    density += layerDensity;
    red += layer.color[0] * layerDensity;
    green += layer.color[1] * layerDensity;
    blue += layer.color[2] * layerDensity;
  }
  if (density <= 0) return;
  const visibleDensity = Math.pow(Math.min(1, density), 0.55);
  const blend = Math.min(0.96, visibleDensity);
  pixels[pixel] = Math.round(pixels[pixel] * (1 - blend) + (red / density) * blend);
  pixels[pixel + 1] = Math.round(pixels[pixel + 1] * (1 - blend) + (green / density) * blend);
  pixels[pixel + 2] = Math.round(pixels[pixel + 2] * (1 - blend) + (blue / density) * blend);
  pixels[pixel + 3] = Math.max(pixels[pixel + 3], Math.round(visibleDensity * 246));
}

function normalizedCategoryDensity(
  sources: ReadonlyMap<string, SeedWorldPopulationPreview["detailDensityFields"][number]>,
  index: number,
  category: "grass" | "flower",
  targetDensityPerSquareMetre: number
): number {
  let density = 0;
  for (const source of sources.values()) {
    if (source.category !== category) continue;
    density += (source.samples[index]! / 255) * source.maximumDensityPerSquareMetre;
  }
  return targetDensityPerSquareMetre > 0 ? density / targetDensityPerSquareMetre : 0;
}

const mountainHeightRasterCache = new WeakMap<SeedWorldPlan, HTMLCanvasElement>();

function mountainHeightRaster(plan: SeedWorldPlan): HTMLCanvasElement {
  const cached = mountainHeightRasterCache.get(plan);
  if (cached) return cached;
  const resolution = plan.resolution;
  const raster = document.createElement("canvas");
  raster.width = raster.height = resolution;
  const context = raster.getContext("2d");
  if (!context) throw new Error("Seed World Planner requires a mountain-height canvas context");
  const pixels = context.createImageData(resolution, resolution);
  for (let row = 0; row < resolution; row++) {
    for (let column = 0; column < resolution; column++) {
      const strength = plan.mountainUpliftSamples[row * resolution + column]! / 65_535;
      const pixel = (row * resolution + column) * 4;
      pixels.data[pixel] = 246;
      pixels.data[pixel + 1] = 238;
      pixels.data[pixel + 2] = 193;
      pixels.data[pixel + 3] = Math.round(strength * 148);
    }
  }
  context.putImageData(pixels, 0, 0);
  mountainHeightRasterCache.set(plan, raster);
  return raster;
}

function rockFillStyle(surfaceKind: SeedWorldDecorationInstance["surfaceKind"]): string {
  if (surfaceKind === "soil") return "rgb(218 195 139 / 92%)";
  if (surfaceKind === "rock") return "rgb(151 139 111 / 92%)";
  return "rgb(196 151 82 / 88%)";
}

function rockStrokeStyle(surfaceKind: SeedWorldDecorationInstance["surfaceKind"]): string {
  return surfaceKind === "grass" ? "rgb(80 57 31 / 88%)" : "rgb(74 67 43 / 88%)";
}

function mapPoint(point: SeedWorldPoint, x: number, y: number, size: number): SeedWorldPoint {
  return { x: x + point.x * size, y: y + point.y * size };
}
