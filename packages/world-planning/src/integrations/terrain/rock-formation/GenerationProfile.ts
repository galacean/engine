import type { PlanningComponentDefinition } from "../../../spatial/PlanningComponents.ts";
import type { PlanningDocument } from "../../../spatial/PlanningDocument.ts";
import { ComponentRegistry, resolveComponent } from "../../../spatial/SpatialDocument.ts";
import { hashSeed, random } from "@galacean/engine-terrain/rock-formation/math";
import type { RockObb } from "@galacean/engine-terrain/rock-formation/types";

/** Authoring defaults, resolved into published OBBs before worker/cache inputs. */
export const ROCK_GENERATION_DEFAULTS = {
  platformShare: 1,
  platformHeightScale: 1,
  platformSlopeRate: 12,
  platformSlopeVariation: 0.2,
  platformHeightVariation: 0.05,
  peakHeightScale: 1,
  peakSlopeVariation: 0.8,
  peakHeightVariation: 0.2
};
export type RockGenerationProfile = typeof ROCK_GENERATION_DEFAULTS;
export type RockGenerationKind = "platform" | "peak";

/** Shared shape defaults for authored OBBs and instanced scenic-rock sources. */
export function rockGenerationShape(
  kind: RockGenerationKind,
  profile: RockGenerationProfile
): Required<Pick<RockObb, "heightMode" | "slopeMode" | "slopeVariation" | "heightVariation">> &
  Pick<RockObb, "slopeRate"> & { heightScale: number } {
  return kind === "platform"
    ? {
        heightScale: profile.platformHeightScale,
        heightMode: "random-ascent",
        slopeMode: "manual",
        slopeRate: profile.platformSlopeRate,
        slopeVariation: profile.platformSlopeVariation,
        heightVariation: profile.platformHeightVariation
      }
    : {
        heightScale: profile.peakHeightScale,
        heightMode: "perlin-ascent",
        slopeMode: "auto",
        slopeVariation: profile.peakSlopeVariation,
        heightVariation: profile.peakHeightVariation
      };
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
  description:
    "以世界 Seed 和稳定 OBB／景观石块实例 ID 独立选择钝顶平台或山峰。平台默认保留原始高度。平台比例是概率，不是数量配额；改变顺序或其他 OBB 不重新抽签。尺寸、模式和坡率的单体覆盖优先。高度倍率应用于原始规划或素材高度，不累积缩放；树脚伴生石共享两类网格，景观散布岩石发布到各自体量。",
  fields: [
    field("platformShare", "Platform share / 平台比例 (0–1)", "", 0.05, 1),
    field("platformHeightScale", "Platform height scale / 平台高度倍率", "×", 0.05),
    field("platformSlopeRate", "Platform base slope / 平台基础坡率", "m/m", 0.1),
    field("platformSlopeVariation", "Platform slope variation / 平台坡率变化", "", 0.05, 1),
    field("platformHeightVariation", "Platform top variation / 平台顶部高度变化", "", 0.01, 1),
    field("peakHeightScale", "Peak height scale / 山峰高度倍率", "×", 0.05),
    field("peakSlopeVariation", "Peak slope variation / 山峰坡率变化", "", 0.05, 1),
    field("peakHeightVariation", "Peak top variation / 山峰顶部高度变化", "", 0.01, 1)
  ],
  validate(values) {
    for (const key of ["platformHeightScale", "peakHeightScale", "platformSlopeRate"] as const)
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
