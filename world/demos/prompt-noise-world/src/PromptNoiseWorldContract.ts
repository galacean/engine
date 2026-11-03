/** Version carried by every prompt-noise world plan. */
export const PROMPT_NOISE_WORLD_PLAN_VERSION = 1 as const;

/** Stable template identities exposed by the single prompt-noise Gallery demo. */
export type PromptNoiseTemplateId =
  | "terrain3d-noise-reference"
  | "north-mountains"
  | "left-peaks"
  | "dense-forest"
  | "sparse-forest"
  | "archipelago"
  | "many-ponds";

/** Directional macro-shape applied before seeded terrain detail. */
export type PromptNoiseDirectionalBias = "none" | "north" | "left";

/** One resolved bounded water body generated from a prompt rule and seed. */
export interface PromptNoiseWaterBodyV1 {
  readonly id: string;
  readonly kind: "lake" | "pond";
  readonly center: readonly [x: number, z: number];
  readonly radius: readonly [x: number, z: number];
  readonly waterLevel: number;
  readonly depth: number;
  readonly irregularity: number;
  readonly seed: number;
}

/** Water rules resolved into small analytic descriptors rather than raster masks. */
export interface PromptNoiseWaterPlanV1 {
  readonly ocean: boolean;
  readonly seaLevel: number;
  readonly bodies: readonly PromptNoiseWaterBodyV1[];
  readonly exactCountDomain?: {
    readonly center: readonly [x: number, z: number];
    readonly size: readonly [width: number, depth: number];
  };
}

/** Four-layer automatic surface thresholds. */
export interface PromptNoiseSurfacePlanV1 {
  readonly snowStart: number;
  readonly snowFull: number;
  readonly rockSlopeStart: number;
  readonly rockSlopeFull: number;
  readonly grassMoisture: number;
  readonly overrideEnabled: boolean;
}

/** One deterministic procedural placement rule. */
export interface DecorationRuleV1 {
  readonly kind: "tree" | "rock" | "shrub" | "flower" | "grass";
  readonly seed: number;
  readonly spacing: number;
  readonly probability: number;
  readonly footprint: number;
  readonly minimumScale: number;
  readonly maximumScale: number;
  readonly maximumSlope: number;
  readonly minimumShoreDistance: number;
}

/** Serializable prompt result sufficient to recreate an unbounded analytic world. */
export interface PromptNoiseWorldPlanV1 {
  readonly version: typeof PROMPT_NOISE_WORLD_PLAN_VERSION;
  readonly prompt: string;
  readonly templateId: PromptNoiseTemplateId;
  readonly rootSeed: number;
  readonly stageSeeds: {
    readonly height: number;
    readonly warp: number;
    readonly moisture: number;
    readonly water: number;
    readonly surface: number;
    readonly decoration: number;
  };
  readonly terrain: {
    readonly noiseProfile: "terrain3d-reference" | "prompt-shaped";
    readonly baseHeight: number;
    readonly relief: number;
    readonly frequency: number;
    readonly warpStrength: number;
    readonly octaves: number;
    readonly ridgeStrength: number;
    readonly ridgeFrequency: number;
    readonly ridgeOctaves: number;
    readonly directionalBias: PromptNoiseDirectionalBias;
    readonly directionalStrength: number;
    readonly directionalUplift: number;
    readonly directionalScale: number;
    readonly archipelago: boolean;
    readonly terrain3dReference: {
      readonly scale: number;
      readonly height: number;
      readonly offset: readonly [x: number, y: number, z: number];
      readonly minimumOctaves: number;
      readonly maximumOctaves: number;
      readonly lodDistance: number;
    };
  };
  readonly surface: PromptNoiseSurfacePlanV1;
  readonly water: PromptNoiseWaterPlanV1;
  readonly decoration: readonly DecorationRuleV1[];
  readonly spawnHint: readonly [x: number, z: number];
  readonly spawnClearanceRadius: number;
}

/** Shareable selector shown as one World Seed in the Gallery controls. */
export interface PromptNoiseWorldSeedPreset {
  readonly label: string;
  readonly templateId: PromptNoiseTemplateId;
  readonly rootSeed: number;
  readonly prompt: string;
}
