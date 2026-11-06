import { hashPromptNoise, promptNoiseUnit } from "@galacean/engine-world-planning/generation/noise/PromptNoiseHash";
import {
  PROMPT_NOISE_WORLD_PLAN_VERSION,
  type DecorationRuleV1,
  type PromptNoiseTemplateId,
  type PromptNoiseWaterBodyV1,
  type PromptNoiseWorldPlanV1,
  type PromptNoiseWorldSeedPreset
} from "./PromptNoiseWorldContract.ts";

export const PROMPT_NOISE_WORLD_PRESETS = Object.freeze([
  { label: "Terrain3D Noise 基线", templateId: "terrain3d-noise-reference", rootSeed: 0, prompt: "Terrain3D World Background Noise 基线" },
  { label: "北部高山", templateId: "north-mountains", rootSeed: 0x1873_5a21, prompt: "北部高山，南部草原" },
  { label: "左侧群峰", templateId: "left-peaks", rootSeed: 0x2b61_4fe3, prompt: "左边山峰多一点" },
  { label: "茂密森林", templateId: "dense-forest", rootSeed: 0x36d4_19a7, prompt: "连绵起伏的茂密森林" },
  { label: "稀疏森林", templateId: "sparse-forest", rootSeed: 0x48a1_73cd, prompt: "开阔草地和稀疏森林" },
  { label: "群岛", templateId: "archipelago", rootSeed: 0x51e7_2c93, prompt: "被海洋包围的群岛" },
  { label: "多水洼", templateId: "many-ponds", rootSeed: 0x6ac3_50f1, prompt: "平缓湿地，水洼多一点" }
] as const satisfies readonly PromptNoiseWorldSeedPreset[]);

const TERRAIN3D_REFERENCE_DEFAULTS = Object.freeze({
  scale: 9.85,
  height: 34,
  offset: Object.freeze([2.17, -1.225, 1.9] as const),
  minimumOctaves: 2,
  maximumOctaves: 4,
  lodDistance: 7500
});

const TEMPLATE_DEFAULTS: Readonly<Record<PromptNoiseTemplateId, Omit<PromptNoiseWorldPlanV1, "prompt" | "rootSeed" | "stageSeeds" | "water" | "decoration">>> = {
  "terrain3d-noise-reference": {
    version: PROMPT_NOISE_WORLD_PLAN_VERSION,
    templateId: "terrain3d-noise-reference",
    terrain: {
      noiseProfile: "terrain3d-reference",
      baseHeight: 0,
      relief: 0,
      frequency: 0,
      warpStrength: 0,
      octaves: 4,
      ridgeStrength: 0,
      ridgeFrequency: 0,
      ridgeOctaves: 0,
      directionalBias: "none",
      directionalStrength: 0,
      directionalUplift: 0,
      directionalScale: 1000,
      archipelago: false,
      terrain3dReference: TERRAIN3D_REFERENCE_DEFAULTS
    },
    surface: { snowStart: 180, snowFull: 240, rockSlopeStart: 0.18, rockSlopeFull: 0.52, grassMoisture: 0.42, overrideEnabled: false },
    spawnHint: [0, 0],
    spawnClearanceRadius: 0
  },
  "north-mountains": {
    version: PROMPT_NOISE_WORLD_PLAN_VERSION,
    templateId: "north-mountains",
    terrain: {
      noiseProfile: "prompt-shaped",
      baseHeight: 24,
      relief: 92,
      frequency: 0.00175,
      warpStrength: 34,
      octaves: 6,
      ridgeStrength: 0.65,
      ridgeFrequency: 0.52,
      ridgeOctaves: 3,
      directionalBias: "north",
      directionalStrength: 1.45,
      directionalUplift: 56,
      directionalScale: 900,
      archipelago: false,
      terrain3dReference: TERRAIN3D_REFERENCE_DEFAULTS
    },
    surface: { snowStart: 118, snowFull: 188, rockSlopeStart: 0.25, rockSlopeFull: 0.62, grassMoisture: 0.38, overrideEnabled: true },
    spawnHint: [0, -280],
    spawnClearanceRadius: 28
  },
  "left-peaks": {
    version: PROMPT_NOISE_WORLD_PLAN_VERSION,
    templateId: "left-peaks",
    terrain: {
      noiseProfile: "prompt-shaped",
      baseHeight: 22,
      relief: 86,
      frequency: 0.0019,
      warpStrength: 42,
      octaves: 6,
      ridgeStrength: 0.72,
      ridgeFrequency: 0.5,
      ridgeOctaves: 3,
      directionalBias: "left",
      directionalStrength: 1.35,
      directionalUplift: 48,
      directionalScale: 950,
      archipelago: false,
      terrain3dReference: TERRAIN3D_REFERENCE_DEFAULTS
    },
    surface: { snowStart: 126, snowFull: 196, rockSlopeStart: 0.24, rockSlopeFull: 0.6, grassMoisture: 0.4, overrideEnabled: true },
    spawnHint: [260, 0],
    spawnClearanceRadius: 28
  },
  "dense-forest": {
    version: PROMPT_NOISE_WORLD_PLAN_VERSION,
    templateId: "dense-forest",
    terrain: {
      noiseProfile: "prompt-shaped",
      baseHeight: 26,
      relief: 48,
      frequency: 0.00155,
      warpStrength: 30,
      octaves: 5,
      ridgeStrength: 0.15,
      ridgeFrequency: 0.58,
      ridgeOctaves: 2,
      directionalBias: "none",
      directionalStrength: 0,
      directionalUplift: 0,
      directionalScale: 1000,
      archipelago: false,
      terrain3dReference: TERRAIN3D_REFERENCE_DEFAULTS
    },
    surface: { snowStart: 180, snowFull: 240, rockSlopeStart: 0.34, rockSlopeFull: 0.7, grassMoisture: 0.48, overrideEnabled: true },
    spawnHint: [0, 0],
    spawnClearanceRadius: 28
  },
  "sparse-forest": {
    version: PROMPT_NOISE_WORLD_PLAN_VERSION,
    templateId: "sparse-forest",
    terrain: {
      noiseProfile: "prompt-shaped",
      baseHeight: 20,
      relief: 42,
      frequency: 0.00145,
      warpStrength: 26,
      octaves: 5,
      ridgeStrength: 0.12,
      ridgeFrequency: 0.58,
      ridgeOctaves: 2,
      directionalBias: "none",
      directionalStrength: 0,
      directionalUplift: 0,
      directionalScale: 1000,
      archipelago: false,
      terrain3dReference: TERRAIN3D_REFERENCE_DEFAULTS
    },
    surface: { snowStart: 180, snowFull: 240, rockSlopeStart: 0.36, rockSlopeFull: 0.72, grassMoisture: 0.35, overrideEnabled: true },
    spawnHint: [0, 0],
    spawnClearanceRadius: 28
  },
  archipelago: {
    version: PROMPT_NOISE_WORLD_PLAN_VERSION,
    templateId: "archipelago",
    terrain: {
      noiseProfile: "prompt-shaped",
      baseHeight: -22,
      relief: 14,
      frequency: 0.0023,
      warpStrength: 18,
      octaves: 5,
      ridgeStrength: 0.16,
      ridgeFrequency: 0.62,
      ridgeOctaves: 2,
      directionalBias: "none",
      directionalStrength: 0,
      directionalUplift: 0,
      directionalScale: 1000,
      archipelago: true,
      terrain3dReference: TERRAIN3D_REFERENCE_DEFAULTS
    },
    surface: { snowStart: 170, snowFull: 230, rockSlopeStart: 0.3, rockSlopeFull: 0.65, grassMoisture: 0.5, overrideEnabled: true },
    spawnHint: [0, 0],
    spawnClearanceRadius: 28
  },
  "many-ponds": {
    version: PROMPT_NOISE_WORLD_PLAN_VERSION,
    templateId: "many-ponds",
    terrain: {
      noiseProfile: "prompt-shaped",
      baseHeight: 13,
      relief: 19,
      frequency: 0.00135,
      warpStrength: 20,
      octaves: 5,
      ridgeStrength: 0.06,
      ridgeFrequency: 0.6,
      ridgeOctaves: 2,
      directionalBias: "none",
      directionalStrength: 0,
      directionalUplift: 0,
      directionalScale: 1000,
      archipelago: false,
      terrain3dReference: TERRAIN3D_REFERENCE_DEFAULTS
    },
    surface: { snowStart: 180, snowFull: 240, rockSlopeStart: 0.4, rockSlopeFull: 0.75, grassMoisture: 0.62, overrideEnabled: true },
    spawnHint: [0, -180],
    spawnClearanceRadius: 28
  }
};

/** Adapter boundary shared by the local deterministic compiler and a future AI compiler. */
export interface PromptNoiseWorldPlanCompiler {
  /**
   * Resolves user language and a root seed into the versioned analytic plan contract.
   * @param prompt User-authored world description.
   * @param rootSeed Unsigned root seed controlling stochastic detail.
   * @param requestedTemplate Optional explicit template selected by the Gallery.
   * @returns Serializable prompt-noise world plan.
   */
  compile(
    prompt: string,
    rootSeed: number,
    requestedTemplate?: PromptNoiseTemplateId
  ): PromptNoiseWorldPlanV1;
}

/** Deterministic local compiler from Chinese prompt semantics into the shared world-plan contract. */
export class PromptNoiseWorldCompiler implements PromptNoiseWorldPlanCompiler {
  /**
   * Compiles one prompt and root seed into a byte-stable analytic world plan.
   * @param prompt User-authored world description.
   * @param rootSeed Unsigned root seed controlling stochastic detail.
   * @param requestedTemplate Optional explicit template selected by the Gallery.
   * @returns Frozen V1 plan with resolved water bodies and stage-isolated seeds.
   */
  compile(prompt: string, rootSeed: number, requestedTemplate?: PromptNoiseTemplateId): PromptNoiseWorldPlanV1 {
    const normalizedPrompt = prompt.trim();
    const templateId = requestedTemplate ?? inferTemplate(normalizedPrompt);
    const defaults = TEMPLATE_DEFAULTS[templateId];
    const seed = rootSeed >>> 0;
    const stageSeeds = Object.freeze({
      height: hashPromptNoise(seed, 1),
      warp: hashPromptNoise(seed, 2),
      moisture: hashPromptNoise(seed, 3),
      water: hashPromptNoise(seed, 4),
      surface: hashPromptNoise(seed, 5),
      decoration: hashPromptNoise(seed, 6)
    });
    const water = compileWater(templateId, stageSeeds.water);
    const decoration = compileDecoration(templateId, stageSeeds.decoration);
    return deepFreeze({
      ...defaults,
      prompt: normalizedPrompt,
      rootSeed: seed,
      stageSeeds,
      water,
      decoration
    });
  }
}

function inferTemplate(prompt: string): PromptNoiseTemplateId {
  if (/Terrain3D|World Background|噪声基线/i.test(prompt)) return "terrain3d-noise-reference";
  if (/群岛|岛屿|海岛|海洋/.test(prompt)) return "archipelago";
  if (/水洼|湿地|湖泊多|多.*水/.test(prompt)) return "many-ponds";
  if (/左.*(山|峰)|(山|峰).*左/.test(prompt)) return "left-peaks";
  if (/北.*(山|峰)|(山|峰).*北/.test(prompt)) return "north-mountains";
  if (/稀疏|开阔/.test(prompt)) return "sparse-forest";
  return /茂密|森林|树木/.test(prompt) ? "dense-forest" : "sparse-forest";
}

function compileWater(templateId: PromptNoiseTemplateId, seed: number): PromptNoiseWorldPlanV1["water"] {
  if (templateId === "archipelago") return Object.freeze({ ocean: true, seaLevel: 0, bodies: Object.freeze([]) });
  if (templateId !== "many-ponds") return Object.freeze({ ocean: false, seaLevel: -1000, bodies: Object.freeze([]) });
  const domain = Object.freeze({ center: Object.freeze([0, 0] as const), size: Object.freeze([900, 900] as const) });
  const bodies: PromptNoiseWaterBodyV1[] = [];
  for (let index = 0; index < 6; index++) {
    const angle = promptNoiseUnit(hashPromptNoise(seed, index, 1)) * Math.PI * 2;
    const radial = 160 + promptNoiseUnit(hashPromptNoise(seed, index, 2)) * 230;
    const radiusX = 34 + promptNoiseUnit(hashPromptNoise(seed, index, 3)) * 54;
    const radiusZ = 30 + promptNoiseUnit(hashPromptNoise(seed, index, 4)) * 48;
    bodies.push(Object.freeze({
      id: `pond-${index}`,
      kind: "pond",
      center: Object.freeze([Math.cos(angle) * radial, Math.sin(angle) * radial] as const),
      radius: Object.freeze([radiusX, radiusZ] as const),
      waterLevel: 9 + promptNoiseUnit(hashPromptNoise(seed, index, 5)) * 2.5,
      depth: 3.5 + promptNoiseUnit(hashPromptNoise(seed, index, 6)) * 3,
      irregularity: 0.12 + promptNoiseUnit(hashPromptNoise(seed, index, 7)) * 0.14,
      seed: hashPromptNoise(seed, index, 8)
    }));
  }
  return Object.freeze({ ocean: false, seaLevel: -1000, bodies: Object.freeze(bodies), exactCountDomain: domain });
}

function compileDecoration(templateId: PromptNoiseTemplateId, seed: number): readonly DecorationRuleV1[] {
  if (templateId === "terrain3d-noise-reference") return Object.freeze([]);
  const dense = templateId === "dense-forest";
  const sparse = templateId === "sparse-forest";
  const island = templateId === "archipelago";
  const wet = templateId === "many-ponds";
  const rules: DecorationRuleV1[] = [
    rule("rock", seed, 1, island ? 17 : 23, island ? 0.34 : 0.2, 2.5, 0.65, 2.4, 0.72, 1.5),
    rule("tree", seed, 2, dense ? 12 : sparse ? 24 : island ? 20 : 17, dense ? 0.78 : sparse ? 0.28 : 0.5, 3.4, 0.72, 1.35, 0.48, wet ? 8 : 4),
    rule("shrub", seed, 3, dense ? 7 : 11, dense ? 0.7 : 0.42, 1.25, 0.65, 1.65, 0.56, 2.5),
    rule("flower", seed, 4, dense ? 3.8 : 5.5, dense ? 0.6 : 0.42, 0.28, 0.65, 1.5, 0.42, 1.5),
    rule("grass", seed, 5, dense ? 2.2 : sparse ? 4.2 : 2.8, dense ? 0.9 : sparse ? 0.54 : 0.76, 0.2, 0.65, 1.5, 0.48, 1.2)
  ];
  return Object.freeze(rules);
}

function rule(
  kind: DecorationRuleV1["kind"],
  seed: number,
  stage: number,
  spacing: number,
  probability: number,
  footprint: number,
  minimumScale: number,
  maximumScale: number,
  maximumSlope: number,
  minimumShoreDistance: number
): DecorationRuleV1 {
  return Object.freeze({
    kind,
    seed: hashPromptNoise(seed, stage),
    spacing,
    probability,
    footprint,
    minimumScale,
    maximumScale,
    maximumSlope,
    minimumShoreDistance
  });
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}
