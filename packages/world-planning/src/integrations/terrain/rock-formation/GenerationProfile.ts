import type { PlanningComponentDefinition } from "../../../spatial/PlanningComponents.ts";
import type { PlanningDocument } from "../../../spatial/PlanningDocument.ts";
import { ComponentRegistry, resolveComponent } from "../../../spatial/SpatialDocument.ts";
import { hashSeed, random } from "@galacean/engine-terrain/rock-formation/math";

/** Authoring defaults, resolved into published OBBs before worker/cache inputs. */
export const ROCK_GENERATION_DEFAULTS = {
  platformShare: 1,
  platformHeightScale: 1,
  peakHeightScale: 1
};
export type RockGenerationProfile = typeof ROCK_GENERATION_DEFAULTS;
export type RockGenerationKind = "platform" | "peak";

/** Retain authored height families when publishing dimensions; geometry uses one shared generator. */
export function rockGenerationShape(kind: RockGenerationKind, profile: RockGenerationProfile): { heightScale: number } {
  return { heightScale: kind === "platform" ? profile.platformHeightScale : profile.peakHeightScale };
}

const field = (key: keyof RockGenerationProfile, label: string, unit: string, step: number, max?: number) => ({
  key,
  label,
  unit,
  type: "number" as const,
  min: 0,
  ...(max === undefined ? {} : { max }),
  step,
  default: ROCK_GENERATION_DEFAULTS[key]
});
export const ROCK_GENERATION_COMPONENT: PlanningComponentDefinition = {
  type: "rockGeneration",
  label: "Rock generation profile / 岩石生成配置",
  version: 1,
  tab: "world",
  sparseGlobal: true,
  presentation: true,
  description: "保留两组高度倍率的布局作者配置。所有岩石的表面和造型由同一个程序化生成器处理。单体尺寸覆盖优先。",
  fields: [
    field("platformShare", "Platform share / 平台比例 (0–1)", "", 0.05, 1),
    field("platformHeightScale", "Platform height scale / 平台高度倍率", "×", 0.05),
    field("peakHeightScale", "Peak height scale / 山峰高度倍率", "×", 0.05)
  ],
  validate(values) {
    for (const key of ["platformHeightScale", "peakHeightScale"] as const)
      if (values[key] !== undefined && !(Number(values[key]) > 0))
        throw new Error(`Rock generation ${key} must be positive / 岩石生成倍率和坡率必须大于 0`);
  }
};
const registry = new ComponentRegistry();
registry.register(ROCK_GENERATION_COMPONENT);

export function readRockGenerationProfile(document: PlanningDocument): RockGenerationProfile {
  const values = document.entities.world?.components.rockGeneration
    ? resolveComponent(document, "world", "rockGeneration", registry).values
    : {};
  return Object.fromEntries(
    Object.entries(ROCK_GENERATION_DEFAULTS).map(([key, value]) => [key, Number(values[key] ?? value)])
  ) as RockGenerationProfile;
}

/** Separate stream: unrelated edits, dimensions, ordering and population never reroll an OBB. */
export function rockGenerationKind(seed: number, obbId: string, profile: RockGenerationProfile): RockGenerationKind {
  return random(hashSeed(seed, `rock-generation/v1/${obbId}`))() < profile.platformShare ? "platform" : "peak";
}
