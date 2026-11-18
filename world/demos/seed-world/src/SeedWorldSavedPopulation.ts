import type { SeedWorldPlan } from "@galacean/engine-world-planning/world/SeedWorldPlanner";
import {
  createSeedWorldPopulationPreviewFromLayout,
  type SeedWorldPopulationInstance,
  type SeedWorldPopulationPreview,
  type SeedWorldDetailDensityField
} from "@galacean/engine-world-planning/runtime/SeedWorldPopulationPlan";

/** Realized placement is persistent state: local edits preserve survivors, not a fresh scatter result. */
export interface SeedWorldSavedPopulationV1 {
  readonly schemaVersion: 1;
  readonly treeSpeciesProfileVersion: number;
  readonly treeCommunityProfileVersion: number;
  readonly detailSpeciesProfileVersion: number;
  readonly instances: readonly SeedWorldPopulationInstance[];
  readonly details: readonly (Omit<SeedWorldDetailDensityField, "samples"> & { readonly samples: readonly number[] })[];
}

export function captureSeedWorldSavedPopulationV1(layout: SeedWorldPopulationPreview): SeedWorldSavedPopulationV1 {
  return parseSeedWorldSavedPopulationV1({
    schemaVersion: 1,
    treeSpeciesProfileVersion: layout.treeSpeciesProfileVersion,
    treeCommunityProfileVersion: layout.treeCommunityProfileVersion,
    detailSpeciesProfileVersion: layout.detailSpeciesProfileVersion,
    instances: layout.treeInstances,
    details: layout.detailDensityFields.map((field) => ({ ...field, samples: Array.from(field.samples) }))
  });
}

export function parseSeedWorldSavedPopulationV1(value: unknown): SeedWorldSavedPopulationV1 {
  const saved = record(value);
  if (saved.schemaVersion !== 1) throw new Error("Unsupported saved Population schema");
  const versions = {
    treeSpeciesProfileVersion: integer(saved.treeSpeciesProfileVersion),
    treeCommunityProfileVersion: integer(saved.treeCommunityProfileVersion),
    detailSpeciesProfileVersion: integer(saved.detailSpeciesProfileVersion)
  };
  if (!Array.isArray(saved.instances) || !Array.isArray(saved.details)) throw new Error("Saved Population arrays are missing");
  const ids = new Set<string>();
  const instances = saved.instances.map((value): SeedWorldPopulationInstance => {
    const item = record(value);
    const id = nonempty(item.id);
    if (ids.has(id)) throw new Error(`Duplicate saved Population instance '${id}'`);
    ids.add(id);
    if (item.category !== "tree" && item.category !== "shrub") throw new Error("Invalid saved sparse Population category");
    if (item.prototypeFamily !== item.category) throw new Error("Saved Population prototype does not match its category");
    const point = record(item.normalizedPosition);
    const intent = record(item.intent);
    if (intent.profileKey !== item.category || !["field", "cluster", "accent", "outcrop", "hero"].includes(String(intent.role))) {
      throw new Error("Invalid saved Population transform intent");
    }
    bounded(intent.sizeRank, 0, 1);
    integer(intent.shapeVariationKey, 0xffff_ffff);
    if (intent.sizeMultiplier !== undefined) positive(intent.sizeMultiplier);
    integer(item.ordinal);
    integer(item.profileVersion);
    integer(item.prototypeRank, 0xffff_ffff);
    finite(item.yawRadians);
    bounded(item.colorVariation, -1, 1);
    nonempty(item.sourceCellId);
    for (const key of ["authoringBrushId", "assetRecipeId", "treeSpeciesProfileKey", "treeCohortProfileKey", "treeCommunityId", "treeClusterId", "treePaletteKey"]) {
      if (item[key] !== undefined) nonempty(item[key]);
    }
    if (item.category === "tree") nonempty(item.assetRecipeId);
    return Object.freeze({
      ...item,
      normalizedPosition: Object.freeze({ x: bounded(point.x, 0, 1), y: bounded(point.y, 0, 1) }),
      intent: Object.freeze({ ...intent }),
      scale: positiveTuple(item.scale, 3),
      footprintMetres: positiveTuple(item.footprintMetres, 2)
    }) as unknown as SeedWorldPopulationInstance;
  });
  const families = new Set<string>();
  const details = saved.details.map((value) => {
    const field = record(value);
    const prototypeFamily = nonempty(field.prototypeFamily);
    if (families.has(prototypeFamily)) throw new Error("Duplicate saved Population detail channel");
    families.add(prototypeFamily);
    nonempty(field.category);
    nonempty(field.assetProfileKey);
    const resolution = integer(field.resolution);
    if (resolution === 0 || !Array.isArray(field.samples) || field.samples.length !== resolution * resolution) {
      throw new Error("Saved Population density raster dimensions do not match");
    }
    bounded(field.maximumDensityPerSquareMetre, 0, Number.MAX_VALUE);
    integer(field.hash, 0xffff_ffff);
    const samples = Object.freeze(field.samples.map((sample) => integer(sample, 255)));
    return Object.freeze({ ...field, samples }) as unknown as SeedWorldSavedPopulationV1["details"][number];
  });
  return Object.freeze({ schemaVersion: 1, ...versions, instances: Object.freeze(instances), details: Object.freeze(details) });
}

/** Restore physical records while retaining the current, validated operation/profile catalog. */
export function restoreSeedWorldSavedPopulationV1(
  plan: SeedWorldPlan,
  baseline: SeedWorldPopulationPreview,
  saved: SeedWorldSavedPopulationV1
): SeedWorldPopulationPreview {
  for (const key of ["treeSpeciesProfileVersion", "treeCommunityProfileVersion", "detailSpeciesProfileVersion"] as const) {
    if (baseline[key] !== saved[key]) throw new Error(`Saved Population ${key} is incompatible with this runtime`);
  }
  if (baseline.detailDensityFields.length !== saved.details.length) throw new Error("Saved Population detail topology changed");
  const details = saved.details.map((field): SeedWorldDetailDensityField => {
    const current = baseline.detailDensityFields.find((candidate) => candidate.prototypeFamily === field.prototypeFamily);
    if (!current || current.category !== field.category || current.assetProfileKey !== field.assetProfileKey || current.resolution !== field.resolution) {
      throw new Error(`Saved Population detail '${field.prototypeFamily}' is incompatible with this runtime`);
    }
    return Object.freeze({ ...field, samples: Uint8Array.from(field.samples) });
  });
  return createSeedWorldPopulationPreviewFromLayout(plan, baseline, saved.instances, details);
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid saved Population record");
  return value as Record<string, unknown>;
}
function nonempty(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) throw new Error("Invalid saved Population identity");
  return value;
}
function finite(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error("Invalid saved Population number");
  return value;
}
function bounded(value: unknown, minimum: number, maximum: number): number {
  const number = finite(value);
  if (number < minimum || number > maximum) throw new Error("Saved Population number is out of range");
  return number;
}
function integer(value: unknown, maximum = Number.MAX_SAFE_INTEGER): number {
  const number = bounded(value, 0, maximum);
  if (!Number.isSafeInteger(number)) throw new Error("Saved Population requires an integer");
  return number;
}
function positive(value: unknown): number {
  const number = finite(value);
  if (number <= 0) throw new Error("Saved Population scale must be positive");
  return number;
}
function positiveTuple(value: unknown, length: number): readonly number[] {
  if (!Array.isArray(value) || value.length !== length) throw new Error("Invalid saved Population transform dimensions");
  return Object.freeze(value.map(positive));
}
