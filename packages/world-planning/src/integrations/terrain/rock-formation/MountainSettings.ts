import type { PlanningComponentDefinition } from "../../../spatial/PlanningComponents.ts";

/** Opt in per world; existing saved worlds retain their authored atomic formations. */
export const MOUNTAIN_DEFAULTS = {
  ridgeArrangement: false,
  rockShaping: false,
  ridgePerlin: false,
  ridgeSeededCounts: true,
  ridgePeaks: 3,
  ridgeBranches: 4,
  ridgeFrequency: 2.7,
  ridgeOctaves: 4,
  ridgeLacunarity: 2,
  ridgePersistence: 0.5,
  fractureDepth: 1.3,
  fractureWidth: 1.6,
  fractureIrregularity: 1.8,
  fractureSmoothing: 0.65
};
export type MountainSettings = typeof MOUNTAIN_DEFAULTS;
export const MOUNTAIN_FIELD_KEYS = new Set(Object.keys(MOUNTAIN_DEFAULTS));
const toggle = (key: keyof MountainSettings, label: string) => ({
  key,
  label,
  type: "boolean" as const,
  default: MOUNTAIN_DEFAULTS[key],
  kinds: ["world"]
});
const number = (key: keyof MountainSettings, label: string, min: number, max: number, step: number) => ({
  key,
  label,
  type: "number" as const,
  default: MOUNTAIN_DEFAULTS[key],
  min,
  max,
  step,
  kinds: ["world"]
});
export const MOUNTAIN_FIELDS: PlanningComponentDefinition["fields"] = [
  toggle("ridgeArrangement", "Ridge arrangement / 山脊排列"),
  toggle("rockShaping", "Shaping and carving / 造型与切削"),
  toggle("ridgePerlin", "Perlin ridge field / 噪声山脊"),
  toggle("ridgeSeededCounts", "Counts from seed / 种子决定数量"),
  number("ridgePeaks", "Main peaks / 主峰数量", 1, 5, 1),
  number("ridgeBranches", "Branches / 支脊数量", 3, 8, 1),
  number("ridgeFrequency", "Noise frequency / 噪声频率", 1, 4, 0.1),
  number("ridgeOctaves", "Noise octaves / 噪声层数", 1, 8, 1),
  number("ridgeLacunarity", "Lacunarity / 频率倍增", 1, 3, 0.1),
  number("ridgePersistence", "Persistence / 振幅衰减", 0, 1, 0.05),
  number("fractureDepth", "Fracture depth / 裂隙深度", 0, 2, 0.05),
  number("fractureWidth", "Fracture width / 裂隙宽度", 0, 2, 0.05),
  number("fractureIrregularity", "Fracture irregularity / 裂隙不规则度", 0, 2, 0.05),
  number("fractureSmoothing", "Fracture normal smoothing / 裂面法线平滑", 0, 1, 0.05)
];
export function readMountainSettings(values: Record<string, unknown>): MountainSettings {
  return Object.fromEntries(
    Object.entries(MOUNTAIN_DEFAULTS).map(([key, fallback]) => [
      key,
      typeof fallback === "boolean" ? (values[key] ?? fallback) : Number(values[key] ?? fallback)
    ])
  ) as MountainSettings;
}
