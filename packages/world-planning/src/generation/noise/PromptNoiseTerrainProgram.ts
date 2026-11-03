import { hashPromptNoise } from "./PromptNoiseHash.ts";
import { decodePromptNoiseWorldCode, type PromptNoiseTerrainFormulaV2 } from "./PromptNoiseTerrainFormula.ts";
import { resolveContinuousRiverDownstreamHeight, RIVER_LIMITS } from "@galacean/engine-water/water/index";

import { PROMPT_NOISE_CLEAR_STREAM_HIGH_PROFILE_V1 } from "@galacean/engine-water/water/presets/river/index";
import {
  PromptNoiseRiverFieldCompiler,
  samplePromptNoiseRiverField,
  type PromptNoiseRiverFieldV1
} from "./PromptNoiseRiverFieldCompiler.ts";

const LEGACY_WORLD_VERSION = 3 as const;
export const PROMPT_NOISE_WORLD_VERSION = 4 as const;
export const PROMPT_NOISE_TEMPLATE_REGISTRY_VERSION = 4 as const;
export type PromptNoiseTemplateRegistryVersion = 1 | 2 | 3 | typeof PROMPT_NOISE_TEMPLATE_REGISTRY_VERSION;
const SUPPORTED_TEMPLATE_REGISTRY_VERSIONS: readonly PromptNoiseTemplateRegistryVersion[] = Object.freeze([1, 2, 3, 4]);
const HEADER_TEXELS = 6;
const LEGACY_OPERATOR_TEXELS = 4;
export const PROMPT_NOISE_C2A_OPERATOR_TEXELS = 7 as const;
const TEXEL_COMPONENTS = 4;
const MAGIC_PREFIX = Object.freeze([80, 78, 87] as const);
const FLOAT32_BYTES = 4;
const MAX_EXACT_FLOAT_INTEGER = 0x00ff_ffff;
const RIVER_SEGMENTS = 12;
const RIVER_FIELD_CACHE = new WeakMap<PromptNoiseRiverOperatorV1, PromptNoiseRiverFieldV1>();

/** Logical world-space point expressed in metres. */
export interface PromptNoiseWorldPointV1 {
  /** Logical X coordinate in metres. */
  readonly x: number;
  /** Logical Z coordinate in metres. */
  readonly z: number;
}

/** Generic normalized section profile attached to a Prompt River centerline. */
export interface PromptNoiseRiverProfilePointV1 {
  /** Normalized centerline factor in ascending order; endpoints must be 0 and 1. */
  readonly factor: number;
  /** Full Water surface width in metres. */
  readonly width: number;
  /** Centerline Water depth in metres. */
  readonly depth: number;
  /** Downstream flow speed in metres per second. */
  readonly flowSpeed: number;
  /** Visual shore feather outside the Water half-width in metres. */
  readonly bankFeather: number;
}

export type PromptNoiseRiverCurveMode = "linear" | "catmull-rom" | "bezier";

/** Stable editable C2-B River point. Handles are absolute logical XZ positions. */
export interface PromptNoiseRiverControlPointV1 {
  readonly id: number;
  readonly position: PromptNoiseWorldPointV1;
  readonly bedHeight: number;
  readonly width: number;
  readonly depth: number;
  readonly flowSpeed: number;
  readonly bankFeather: number;
  readonly inHandle: PromptNoiseWorldPointV1;
  readonly outHandle: PromptNoiseWorldPointV1;
}

/** Explicit C2-C topology for one River Operator treated as one directed Reach. */
export interface PromptNoiseRiverReachTopologyV1 {
  readonly networkId: number;
  readonly fromNodeId: number;
  readonly toNodeId: number;
  readonly fromMergeRadius: number;
  readonly toMergeRadius: number;
}

/** Seeded continuous terrain parameters evaluated before local operators. */
export interface PromptNoiseTerrainBaseV1 {
  /** Unsigned root seed used to derive independent stochastic stages. */
  readonly rootSeed: number;
  /** Terrain3D-aligned FBM scale. */
  readonly worldNoiseScale: number;
  /** Terrain3D-aligned FBM height scale in metres before the shader's factor of ten. */
  readonly worldNoiseHeight: number;
  /** World-space FBM offset `[x, height, z]`. */
  readonly worldNoiseOffset: readonly [x: number, height: number, z: number];
  /** Added height of the deterministic continuous ridge strokes in metres. */
  readonly ridgeStrength: number;
  /** Ridge cell frequency in inverse metres. */
  readonly ridgeFrequency: number;
  /** Exponent controlling ridge width. */
  readonly ridgeSharpness: number;
}

/** Operator kinds supported by the first analytic authoring experiment. */
export type PromptNoiseTerrainOperatorKind = "river" | "flatten" | "smooth";

/** Stable template identities available from the authoring panel. */
export type PromptNoiseOperatorTemplateId =
  | "river-shallow"
  | "river-wide"
  | "river-canyon"
  | "flatten-camp"
  | "flatten-plateau"
  | "flatten-plain"
  | "smooth-light"
  | "smooth-strong"
  | "smooth-large";

interface PromptNoiseOperatorCommonV1 {
  /** Exact integer identity retained across edits and history operations. */
  readonly id: number;
  /** Whether this operator participates in evaluation. */
  readonly enabled: boolean;
  /** Preset provenance; resolved values remain authoritative. */
  readonly templateId: PromptNoiseOperatorTemplateId;
  /** Logical operator anchor in metres. */
  readonly anchor: PromptNoiseWorldPointV1;
  /** Normalized XZ direction used by oriented operators. */
  readonly forward: PromptNoiseWorldPointV1;
}

/** Compact quadratic river-valley constraint. */
export interface PromptNoiseRiverOperatorV1 extends PromptNoiseOperatorCommonV1 {
  /** Discriminant used by contracts, codecs, and shaders. */
  readonly kind: "river";
  /** End-to-end curve length in metres. */
  readonly length: number;
  /** Signed lateral displacement of the quadratic control point in metres. */
  readonly bend: number;
  /** Half width of the nearly flat riverbed in metres. */
  readonly halfWidth: number;
  /** Compact-support transition width outside the riverbed in metres. */
  readonly bankWidth: number;
  /** Resolved riverbed elevation at the upstream end in metres. */
  readonly startHeight: number;
  /** Resolved riverbed elevation at the downstream end in metres. */
  readonly endHeight: number;
  /** Elevation gained from river center to the outer support edge in metres. */
  readonly bankHeight: number;
  /** Replacement strength in the inclusive range 0–1. */
  readonly strength: number;
  /**
   * C2-A section data. The runtime contract is a generic ordered array; the
   * first editor/persistence slice exposes exactly source, middle, and mouth.
   */
  readonly profilePoints?: readonly PromptNoiseRiverProfilePointV1[];
  /** C2-B authoring curve. Absent on byte-exact PNW3 recipes. */
  readonly curveMode?: PromptNoiseRiverCurveMode;
  /** Arbitrary ordered control points. Absent on byte-exact PNW3 recipes. */
  readonly controlPoints?: readonly PromptNoiseRiverControlPointV1[];
  /** Next stable control-point identity. */
  readonly nextControlPointId?: number;
  /** Explicit persisted Network / Node ownership. Absent on byte-exact pre-C2-C PNW4 recipes. */
  readonly topology?: PromptNoiseRiverReachTopologyV1;
}

/** Compact circular target-height constraint. */
export interface PromptNoiseFlattenOperatorV1 extends PromptNoiseOperatorCommonV1 {
  /** Discriminant used by contracts, codecs, and shaders. */
  readonly kind: "flatten";
  /** Outer radius of the affected disk in metres. */
  readonly radius: number;
  /** Smooth transition width at the edge in metres. */
  readonly falloff: number;
  /** Resolved target elevation in metres. */
  readonly targetHeight: number;
  /** Replacement strength in the inclusive range 0–1. */
  readonly strength: number;
}

/** Compact circular five-tap smoothing constraint. */
export interface PromptNoiseSmoothOperatorV1 extends PromptNoiseOperatorCommonV1 {
  /** Discriminant used by contracts, codecs, and shaders. */
  readonly kind: "smooth";
  /** Outer radius of the affected disk in metres. */
  readonly radius: number;
  /** Smooth transition width at the edge in metres. */
  readonly falloff: number;
  /** Neighbor distance used by the five-tap stencil in metres. */
  readonly sampleRadius: number;
  /** Diffusion strength in the inclusive range 0–1. */
  readonly strength: number;
}

/** Ordered local terrain instruction evaluated over the infinite base field. */
export type PromptNoiseTerrainOperatorV1 =
  | PromptNoiseRiverOperatorV1
  | PromptNoiseFlattenOperatorV1
  | PromptNoiseSmoothOperatorV1;

/** Complete replayable world recipe independent of world area or Region count. */
export interface PromptNoiseWorldRecipeV3 {
  /** Contract version. */
  readonly version: 3;
  /** Version of the authoring preset registry used for provenance labels. */
  readonly templateRegistryVersion: PromptNoiseTemplateRegistryVersion;
  /** Continuous base field. */
  readonly base: PromptNoiseTerrainBaseV1;
  /** Stable evaluation order; shape operators precede the final Smooth stage. */
  readonly operators: readonly PromptNoiseTerrainOperatorV1[];
  /** Next exact operator id allocated by authoring. */
  readonly nextOperatorId: number;
}

/** Arbitrary-control-point Prompt Noise world recipe. */
export interface PromptNoiseWorldRecipeV4 {
  readonly version: 4;
  readonly templateRegistryVersion: 4;
  readonly base: PromptNoiseTerrainBaseV1;
  readonly operators: readonly PromptNoiseTerrainOperatorV1[];
  readonly nextOperatorId: number;
  /** Next stable topology identities; absent while every River remains an implicit singleton Body. */
  readonly nextRiverNetworkId?: number;
  readonly nextRiverNodeId?: number;
}

export type PromptNoiseWorldRecipe = PromptNoiseWorldRecipeV3 | PromptNoiseWorldRecipeV4;

/** Panel-authored parameters compiled together with an anchor and view direction. */
export interface PromptNoisePlacementParametersV1 {
  /** River end-to-end length in metres. */
  readonly length: number;
  /** River signed lateral bend in metres. */
  readonly bend: number;
  /** Riverbed half width in metres. */
  readonly halfWidth: number;
  /** Riverbank transition width in metres. */
  readonly bankWidth: number;
  /** Riverbed cut below sampled terrain in metres. */
  readonly cutDepth: number;
  /** Minimum upstream-to-downstream drop in metres. */
  readonly minimumDrop: number;
  /** Riverbank height in metres. */
  readonly bankHeight: number;
  /** Source full Water width in metres. */
  readonly sourceWidth: number;
  /** Source Water depth in metres. */
  readonly sourceDepth: number;
  /** Source downstream flow speed in metres per second. */
  readonly sourceFlowSpeed: number;
  /** Source Water shore feather in metres. */
  readonly sourceBankFeather: number;
  /** Middle full Water width in metres. */
  readonly middleWidth: number;
  /** Middle Water depth in metres. */
  readonly middleDepth: number;
  /** Middle downstream flow speed in metres per second. */
  readonly middleFlowSpeed: number;
  /** Middle Water shore feather in metres. */
  readonly middleBankFeather: number;
  /** Mouth full Water width in metres. */
  readonly mouthWidth: number;
  /** Mouth Water depth in metres. */
  readonly mouthDepth: number;
  /** Mouth downstream flow speed in metres per second. */
  readonly mouthFlowSpeed: number;
  /** Mouth Water shore feather in metres. */
  readonly mouthBankFeather: number;
  /** Disk radius in metres for Flatten or Smooth. */
  readonly radius: number;
  /** Disk edge transition in metres for Flatten or Smooth. */
  readonly falloff: number;
  /** Flatten elevation offset from the sampled anchor in metres. */
  readonly heightOffset: number;
  /** Smooth neighbor distance in metres. */
  readonly sampleRadius: number;
  /** Operator strength in the inclusive range 0–1. */
  readonly strength: number;
}

/** Placement request shared by mouse, camera-center, templates, and future prompt compilation. */
export interface PromptNoisePlacementIntentV1 {
  /** Operator kind to create. */
  readonly tool: PromptNoiseTerrainOperatorKind;
  /** Preset providing initial values and a stable provenance label. */
  readonly templateId: PromptNoiseOperatorTemplateId;
  /** Logical world anchor in metres. */
  readonly anchor: PromptNoiseWorldPointV1;
  /** Preferred ground-plane direction; normalization is performed by the compiler. */
  readonly forward: PromptNoiseWorldPointV1;
  /** Fully resolved panel values. */
  readonly parameters: PromptNoisePlacementParametersV1;
}

/** Axis-aligned compact support used to select active local operators. */
export interface PromptNoiseOperatorBoundsV1 {
  /** Inclusive minimum logical X coordinate in metres. */
  readonly minX: number;
  /** Inclusive minimum logical Z coordinate in metres. */
  readonly minZ: number;
  /** Inclusive maximum logical X coordinate in metres. */
  readonly maxX: number;
  /** Inclusive maximum logical Z coordinate in metres. */
  readonly maxZ: number;
}

/** Ray expressed in logical world metres for analytic terrain picking. */
export interface PromptNoiseWorldRayV1 {
  /** Ray origin. */
  readonly origin: readonly [x: number, y: number, z: number];
  /** Non-zero direction; normalization is not required. */
  readonly direction: readonly [x: number, y: number, z: number];
}

/** Nearest sampled intersection with the analytic height field. */
export interface PromptNoiseTerrainIntersectionV1 {
  /** Logical X coordinate in metres. */
  readonly x: number;
  /** Terrain elevation in metres. */
  readonly y: number;
  /** Logical Z coordinate in metres. */
  readonly z: number;
  /** Ray parameter at the hit. */
  readonly distance: number;
}

/** Canonical binary and texture representation of one V3 world recipe. */
export interface PromptNoiseEncodedWorldV3 {
  /** Short numeric registry key embedded in the header. */
  readonly worldId: number;
  /** RGBA32F header and operator texels. */
  readonly texels: Float32Array;
  /** Explicit little-endian byte stream for export and hashing. */
  readonly bytes: Uint8Array;
}

/** Authoring presets resolved into editable panel values. */
export const PROMPT_NOISE_OPERATOR_TEMPLATES: Readonly<
  Record<PromptNoiseOperatorTemplateId, PromptNoisePlacementParametersV1>
> = deepFreeze({
  "river-shallow": placementParameters({
    length: 720,
    bend: 110,
    halfWidth: 18,
    bankWidth: 90,
    cutDepth: 8,
    minimumDrop: 12,
    bankHeight: 28,
    strength: 0.72
  }),
  "river-wide": placementParameters({
    length: 1050,
    bend: 180,
    halfWidth: 25,
    bankWidth: 180,
    cutDepth: 18,
    minimumDrop: 24,
    bankHeight: 64,
    strength: 0.82
  }),
  "river-canyon": placementParameters({
    length: 900,
    bend: -130,
    halfWidth: 24,
    bankWidth: 120,
    cutDepth: 52,
    minimumDrop: 34,
    bankHeight: 118,
    strength: 0.92
  }),
  "flatten-camp": placementParameters({ radius: 90, falloff: 36, heightOffset: 0, strength: 0.84 }),
  "flatten-plateau": placementParameters({ radius: 220, falloff: 88, heightOffset: 12, strength: 0.88 }),
  "flatten-plain": placementParameters({ radius: 480, falloff: 210, heightOffset: -4, strength: 0.72 }),
  "smooth-light": placementParameters({ radius: 150, falloff: 70, sampleRadius: 16, strength: 0.48 }),
  "smooth-strong": placementParameters({ radius: 260, falloff: 120, sampleRadius: 42, strength: 0.9 }),
  "smooth-large": placementParameters({ radius: 520, falloff: 240, sampleRadius: 70, strength: 0.76 })
});

/** Default V3 experiment exposes the exact Terrain3D noise baseline before local authoring. */
export const DEFAULT_PROMPT_NOISE_WORLD_RECIPE: PromptNoiseWorldRecipeV4 = normalizePromptNoiseWorldRecipe({
  version: PROMPT_NOISE_WORLD_VERSION,
  templateRegistryVersion: PROMPT_NOISE_TEMPLATE_REGISTRY_VERSION,
  base: {
    rootSeed: 0,
    worldNoiseScale: 9.85,
    worldNoiseHeight: 34,
    worldNoiseOffset: [2.17, -1.225, 1.9],
    ridgeStrength: 0,
    ridgeFrequency: 0.0015,
    ridgeSharpness: 4
  },
  operators: [],
  nextOperatorId: 1
});

/**
 * Owns normalization, placement compilation, evaluation, active selection, and binary encoding for one recipe.
 */
export class PromptNoiseTerrainProgram {
  readonly recipe: PromptNoiseWorldRecipe;

  /**
   * Creates a detached deterministic terrain program.
   * @param recipe Candidate V3 recipe.
   * @throws If any seed, coordinate, template, id, or operator parameter is invalid.
   */
  constructor(recipe: PromptNoiseWorldRecipe) {
    this.recipe = normalizePromptNoiseWorldRecipe(recipe);
  }

  /**
   * Evaluates the complete shaped and smoothed terrain.
   * @param worldX Logical world X in metres.
   * @param worldZ Logical world Z in metres.
   * @returns Continuous elevation in metres.
   */
  sampleHeight(worldX: number, worldZ: number): number {
    return samplePromptNoiseHeight(this.recipe, worldX, worldZ);
  }

  /**
   * Compiles one panel or prompt placement into a fully resolved local operator.
   * @param intent Placement semantics and editable parameters.
   * @returns Frozen operator using the recipe's next stable id.
   */
  compilePlacement(intent: PromptNoisePlacementIntentV1): PromptNoiseTerrainOperatorV1 {
    const forward = normalizeDirection(intent.forward);
    const anchor = freezePoint(intent.anchor);
    const id = this.recipe.nextOperatorId;
    const parameters = validatePlacementParameters(intent.parameters);
    assertTemplateKind(intent.templateId, intent.tool);
    if (intent.tool === "river") {
      const profilePoints =
        this.recipe.templateRegistryVersion >= 3 ? createC2ARiverProfilePoints(parameters) : undefined;
      const halfLength = parameters.length * 0.5;
      const start = { x: anchor.x - forward.x * halfLength, z: anchor.z - forward.z * halfLength };
      const end = { x: anchor.x + forward.x * halfLength, z: anchor.z + forward.z * halfLength };
      const startSurface = this.sampleHeight(start.x, start.z);
      const endSurface = this.sampleHeight(end.x, end.z);
      const upstreamIsStart = startSurface >= endSurface;
      const riverForward = upstreamIsStart ? forward : { x: -forward.x, z: -forward.z };
      const upstreamHeight = Math.max(startSurface, endSurface) - parameters.cutDepth;
      const requestedDownstreamHeight = Math.min(
        Math.min(startSurface, endSurface) - parameters.cutDepth,
        upstreamHeight - parameters.minimumDrop
      );
      const downstreamHeight = resolveContinuousRiverDownstreamHeight(
        upstreamHeight,
        requestedDownstreamHeight,
        parameters.length,
        // Leave a deterministic Float32 margin so Water validation never has
        // to repair an externally resolved profile at the exact limit.
        Math.max(0, PROMPT_NOISE_CLEAR_STREAM_HIGH_PROFILE_V1.maximumSurfaceSlope - 1e-4)
      );
      return freezeOperator({
        id,
        enabled: true,
        kind: "river",
        templateId: intent.templateId,
        anchor,
        forward: riverForward,
        length: parameters.length,
        bend: upstreamIsStart ? parameters.bend : -parameters.bend,
        halfWidth: profilePoints ? Math.max(...profilePoints.map(({ width }) => width)) * 0.5 : parameters.halfWidth,
        bankWidth: parameters.bankWidth,
        startHeight: upstreamHeight,
        endHeight: downstreamHeight,
        bankHeight: parameters.bankHeight,
        strength: parameters.strength,
        profilePoints,
        ...(this.recipe.version >= 4
          ? createC2BRiverControlPointState(
              anchor,
              riverForward,
              parameters.length,
              upstreamIsStart ? parameters.bend : -parameters.bend,
              upstreamHeight,
              downstreamHeight,
              profilePoints ?? createC2ARiverProfilePoints(parameters)
            )
          : {})
      });
    }
    if (intent.tool === "flatten") {
      return freezeOperator({
        id,
        enabled: true,
        kind: "flatten",
        templateId: intent.templateId,
        anchor,
        forward,
        radius: parameters.radius,
        falloff: parameters.falloff,
        targetHeight: this.sampleHeight(anchor.x, anchor.z) + parameters.heightOffset,
        strength: parameters.strength
      });
    }
    return freezeOperator({
      id,
      enabled: true,
      kind: "smooth",
      templateId: intent.templateId,
      anchor,
      forward,
      radius: parameters.radius,
      falloff: parameters.falloff,
      sampleRadius: parameters.sampleRadius,
      strength: parameters.strength
    });
  }

  /**
   * Creates a new program with a draft appended or replacing an existing identity.
   * @param operator Draft or committed operator.
   * @returns New detached program; this instance is unchanged.
   */
  withOperator(operator: PromptNoiseTerrainOperatorV1): PromptNoiseTerrainProgram {
    const editableRecipe =
      this.recipe.version === LEGACY_WORLD_VERSION ? upgradePromptNoiseWorldRecipeV4(this.recipe) : this.recipe;
    let editableOperator =
      operator.kind === "river" && !operator.controlPoints ? upgradePromptNoiseRiverOperatorV4(operator) : operator;
    let nextRiverNetworkId = editableRecipe.nextRiverNetworkId;
    let nextRiverNodeId = editableRecipe.nextRiverNodeId;
    if (
      editableOperator.kind === "river" &&
      !editableOperator.topology &&
      nextRiverNetworkId !== undefined &&
      nextRiverNodeId !== undefined
    ) {
      editableOperator = {
        ...editableOperator,
        topology: {
          networkId: nextRiverNetworkId,
          fromNodeId: nextRiverNodeId,
          toNodeId: nextRiverNodeId + 1,
          fromMergeRadius: 0,
          toMergeRadius: 0
        }
      };
      nextRiverNetworkId++;
      nextRiverNodeId += 2;
    }
    const index = editableRecipe.operators.findIndex((entry) => entry.id === editableOperator.id);
    const operators = [...editableRecipe.operators];
    if (index >= 0) operators[index] = editableOperator;
    else {
      const firstSmoothIndex = operators.findIndex((entry) => entry.kind === "smooth");
      if (editableOperator.kind !== "smooth" && firstSmoothIndex >= 0) {
        operators.splice(firstSmoothIndex, 0, editableOperator);
      } else {
        operators.push(editableOperator);
      }
    }
    return new PromptNoiseTerrainProgram({
      ...editableRecipe,
      operators,
      nextOperatorId: Math.max(editableRecipe.nextOperatorId, editableOperator.id + 1),
      ...(nextRiverNetworkId !== undefined && nextRiverNodeId !== undefined
        ? { nextRiverNetworkId, nextRiverNodeId }
        : {})
    });
  }

  /**
   * Creates a new program without one operator.
   * @param operatorId Stable identity to remove.
   * @returns New detached program.
   */
  withoutOperator(operatorId: number): PromptNoiseTerrainProgram {
    const editableRecipe =
      this.recipe.version === LEGACY_WORLD_VERSION ? upgradePromptNoiseWorldRecipeV4(this.recipe) : this.recipe;
    return new PromptNoiseTerrainProgram({
      ...editableRecipe,
      operators: editableRecipe.operators.filter((entry) => entry.id !== operatorId)
    });
  }

  /**
   * Reorders one operator by one stable step within its evaluation stage.
   * @param operatorId Stable identity to move.
   * @param direction Negative moves earlier and positive moves later.
   * @returns New detached program; incompatible stage crossings remain unchanged.
   */
  moveOperator(operatorId: number, direction: -1 | 1): PromptNoiseTerrainProgram {
    const editableRecipe =
      this.recipe.version === LEGACY_WORLD_VERSION ? upgradePromptNoiseWorldRecipeV4(this.recipe) : this.recipe;
    const operators = [...editableRecipe.operators];
    const index = operators.findIndex((entry) => entry.id === operatorId);
    if (index < 0) return this;
    const target = index + direction;
    if (target < 0 || target >= operators.length || stageOf(operators[index]) !== stageOf(operators[target]))
      return this;
    [operators[index], operators[target]] = [operators[target], operators[index]];
    return new PromptNoiseTerrainProgram({ ...editableRecipe, operators });
  }

  /**
   * Selects operators whose compact support intersects a logical world rectangle.
   * @param bounds Inclusive logical query bounds in metres.
   * @returns Stable recipe-order subset.
   */
  selectActiveOperators(bounds: PromptNoiseOperatorBoundsV1): readonly PromptNoiseTerrainOperatorV1[] {
    validateBounds(bounds);
    return Object.freeze(this.recipe.operators.filter((operator) => intersects(operatorBounds(operator), bounds)));
  }

  /**
   * Encodes the complete recipe into the fixed RGBA32F texel contract.
   * @param worldId Short numeric registry key placed in the header.
   * @returns Detached texels and explicit little-endian bytes.
   */
  encode(worldId: number): PromptNoiseEncodedWorldV3 {
    return encodePromptNoiseWorldRecipe(this.recipe, worldId);
  }

  /** Returns the immutable compiled field for one C2-B River operator. */
  getRiverField(operatorId: number): PromptNoiseRiverFieldV1 | undefined {
    const operator = this.recipe.operators.find(
      (entry): entry is PromptNoiseRiverOperatorV1 => entry.id === operatorId && entry.kind === "river"
    );
    return operator?.controlPoints ? compiledRiverField(operator) : undefined;
  }
}

/** Validates and freezes a complete PNW3 or PNW4 recipe without implicit migration. */
export function normalizePromptNoiseWorldRecipe(recipe: PromptNoiseWorldRecipeV3): PromptNoiseWorldRecipeV3;
export function normalizePromptNoiseWorldRecipe(recipe: PromptNoiseWorldRecipeV4): PromptNoiseWorldRecipeV4;
export function normalizePromptNoiseWorldRecipe(recipe: PromptNoiseWorldRecipe): PromptNoiseWorldRecipe;
export function normalizePromptNoiseWorldRecipe(recipe: PromptNoiseWorldRecipe): PromptNoiseWorldRecipe {
  if (
    (recipe.version !== LEGACY_WORLD_VERSION && recipe.version !== PROMPT_NOISE_WORLD_VERSION) ||
    !SUPPORTED_TEMPLATE_REGISTRY_VERSIONS.includes(recipe.templateRegistryVersion) ||
    (recipe.version === LEGACY_WORLD_VERSION && recipe.templateRegistryVersion >= 4) ||
    (recipe.version === PROMPT_NOISE_WORLD_VERSION && recipe.templateRegistryVersion !== 4)
  ) {
    throw new RangeError("Prompt-noise world recipe version is unsupported");
  }
  const base = recipe.base;
  if (
    !isUint32(base.rootSeed) ||
    !isPositiveFinite(base.worldNoiseScale) ||
    !isPositiveFinite(base.worldNoiseHeight) ||
    base.worldNoiseOffset.length !== 3 ||
    base.worldNoiseOffset.some((value) => !Number.isFinite(value)) ||
    !isNonNegativeFinite(base.ridgeStrength) ||
    !isPositiveFinite(base.ridgeFrequency) ||
    !isPositiveFinite(base.ridgeSharpness) ||
    base.ridgeSharpness < 1
  ) {
    throw new RangeError("Prompt-noise terrain base is invalid");
  }
  if (
    !Number.isInteger(recipe.nextOperatorId) ||
    recipe.nextOperatorId < 1 ||
    recipe.nextOperatorId > MAX_EXACT_FLOAT_INTEGER
  ) {
    throw new RangeError("Prompt-noise next operator id is invalid");
  }
  const ids = new Set<number>();
  const operators = recipe.operators.map((operator) => {
    const normalized = normalizeOperator(operator, recipe.templateRegistryVersion);
    if (ids.has(normalized.id)) throw new RangeError(`Duplicate prompt-noise operator id ${normalized.id}`);
    ids.add(normalized.id);
    return normalized;
  });
  if (
    operators.some(
      (operator, index) =>
        operator.kind !== "smooth" && operators.slice(0, index).some((entry) => entry.kind === "smooth")
    )
  ) {
    throw new RangeError("Prompt-noise Smooth operators must follow shape operators");
  }
  if (operators.some((operator) => operator.id >= recipe.nextOperatorId)) {
    throw new RangeError("Prompt-noise next operator id must exceed every allocated id");
  }
  const topology =
    recipe.version === PROMPT_NOISE_WORLD_VERSION
      ? normalizeRecipeRiverTopology(operators, recipe.nextRiverNetworkId, recipe.nextRiverNodeId)
      : undefined;
  const common = {
    templateRegistryVersion: recipe.templateRegistryVersion,
    base: {
      rootSeed: base.rootSeed >>> 0,
      worldNoiseScale: Math.fround(base.worldNoiseScale),
      worldNoiseHeight: Math.fround(base.worldNoiseHeight),
      worldNoiseOffset: base.worldNoiseOffset.map(Math.fround) as [number, number, number],
      ridgeStrength: Math.fround(base.ridgeStrength),
      ridgeFrequency: Math.fround(base.ridgeFrequency),
      ridgeSharpness: Math.fround(base.ridgeSharpness)
    },
    operators,
    nextOperatorId: recipe.nextOperatorId
  };
  return recipe.version === LEGACY_WORLD_VERSION
    ? (deepFreeze({ ...common, version: LEGACY_WORLD_VERSION }) as PromptNoiseWorldRecipeV3)
    : deepFreeze({
        ...common,
        version: PROMPT_NOISE_WORLD_VERSION,
        templateRegistryVersion: 4,
        ...(topology ?? {})
      });
}

function normalizeRecipeRiverTopology(
  operators: readonly PromptNoiseTerrainOperatorV1[],
  nextRiverNetworkId: number | undefined,
  nextRiverNodeId: number | undefined
): Readonly<{ nextRiverNetworkId: number; nextRiverNodeId: number }> | undefined {
  const reaches = operators.filter(
    (operator): operator is PromptNoiseRiverOperatorV1 => operator.kind === "river" && operator.topology !== undefined
  );
  const riverCount = operators.filter((operator) => operator.kind === "river").length;
  if (reaches.length === 0) {
    if (nextRiverNetworkId !== undefined || nextRiverNodeId !== undefined) {
      throw new RangeError("Prompt-noise River topology counters require explicit Reach topology");
    }
    return undefined;
  }
  if (reaches.length !== riverCount) {
    throw new RangeError("Prompt-noise River topology must cover every River operator");
  }
  if (
    !Number.isInteger(nextRiverNetworkId) ||
    !Number.isInteger(nextRiverNodeId) ||
    nextRiverNetworkId! < 1 ||
    nextRiverNodeId! < 1 ||
    nextRiverNetworkId! > MAX_EXACT_FLOAT_INTEGER ||
    nextRiverNodeId! > MAX_EXACT_FLOAT_INTEGER ||
    reaches.some((river) => river.topology!.networkId >= nextRiverNetworkId!) ||
    reaches.some(
      (river) => river.topology!.fromNodeId >= nextRiverNodeId! || river.topology!.toNodeId >= nextRiverNodeId!
    )
  ) {
    throw new RangeError("Prompt-noise next River topology identities are invalid");
  }
  const nodeFacts = new Map<number, { networkId: number; mergeRadius: number }>();
  for (const river of reaches) {
    const topology = river.topology!;
    for (const [nodeId, mergeRadius] of [
      [topology.fromNodeId, topology.fromMergeRadius],
      [topology.toNodeId, topology.toMergeRadius]
    ] as const) {
      const previous = nodeFacts.get(nodeId);
      if (
        previous &&
        (previous.networkId !== topology.networkId || Math.abs(previous.mergeRadius - mergeRadius) > 1e-5)
      ) {
        throw new RangeError(`Prompt-noise River node ${nodeId} has inconsistent topology facts`);
      }
      nodeFacts.set(nodeId, { networkId: topology.networkId, mergeRadius });
    }
  }
  return deepFreeze({ nextRiverNetworkId: nextRiverNetworkId!, nextRiverNodeId: nextRiverNodeId! });
}

/** Encodes one normalized PNW3 or PNW4 recipe into a portable little-endian RGBA32F stream. */
export function encodePromptNoiseWorldRecipe(
  recipe: PromptNoiseWorldRecipe,
  worldId: number
): PromptNoiseEncodedWorldV3 {
  const normalized = normalizePromptNoiseWorldRecipe(recipe);
  if (!isUint32(worldId)) throw new RangeError("Prompt-noise World Seed ID must be uint32");
  const operatorPayload =
    normalized.version === LEGACY_WORLD_VERSION
      ? encodePromptNoiseOperatorTexels(normalized.operators, normalized.templateRegistryVersion)
      : encodePromptNoiseV4OperatorTexels(normalized.operators);
  const operatorPayloadTexels = operatorPayload.length / TEXEL_COMPONENTS;
  const texels = new Float32Array((HEADER_TEXELS + operatorPayloadTexels) * TEXEL_COMPONENTS);
  texels.set([...MAGIC_PREFIX, normalized.version], 0);
  texels.set([low16(normalized.base.rootSeed), high16(normalized.base.rootSeed), low16(worldId), high16(worldId)], 4);
  texels.set(
    [
      normalized.base.worldNoiseScale,
      normalized.base.worldNoiseHeight,
      normalized.base.worldNoiseOffset[0],
      normalized.base.worldNoiseOffset[1]
    ],
    8
  );
  texels.set(
    [
      normalized.base.worldNoiseOffset[2],
      normalized.base.ridgeStrength,
      normalized.base.ridgeFrequency,
      normalized.base.ridgeSharpness
    ],
    12
  );
  texels.set(
    [
      normalized.templateRegistryVersion,
      normalized.operators.length,
      normalized.nextOperatorId,
      normalized.version === PROMPT_NOISE_WORLD_VERSION ? operatorPayloadTexels : 0
    ],
    16
  );
  texels.set(
    normalized.version === PROMPT_NOISE_WORLD_VERSION
      ? [normalized.nextRiverNetworkId ?? 0, normalized.nextRiverNodeId ?? 0, 0, 0]
      : [0, 0, 0, 0],
    20
  );
  texels.set(operatorPayload, HEADER_TEXELS * TEXEL_COMPONENTS);
  return Object.freeze({ worldId: worldId >>> 0, texels, bytes: float32ToLittleEndianBytes(texels) });
}

/** Decodes PNW3 byte-exactly or PNW4 with arbitrary control-point records. */
export function decodePromptNoiseWorldRecipe(bytes: Uint8Array): {
  readonly worldId: number;
  readonly program: PromptNoiseTerrainProgram;
  readonly sourceWorldVersion: 3 | 4;
} {
  if (bytes.byteLength < HEADER_TEXELS * TEXEL_COMPONENTS * FLOAT32_BYTES || bytes.byteLength % 16 !== 0) {
    throw new RangeError("Prompt-noise world byte length is invalid");
  }
  const texels = littleEndianBytesToFloat32(bytes);
  if (MAGIC_PREFIX.some((value, index) => texels[index] !== value)) {
    throw new RangeError("Prompt-noise world magic is invalid");
  }
  const sourceWorldVersion = exactInteger(texels[3], "world version");
  if (sourceWorldVersion !== LEGACY_WORLD_VERSION && sourceWorldVersion !== PROMPT_NOISE_WORLD_VERSION) {
    throw new RangeError("Prompt-noise world version is unsupported");
  }
  const rootSeed = join16(texels[4], texels[5]);
  const worldId = join16(texels[6], texels[7]);
  const templateRegistryVersion = exactInteger(
    texels[16],
    "template registry version"
  ) as PromptNoiseTemplateRegistryVersion;
  const operatorCount = exactInteger(texels[17], "operator count");
  const payload = texels.subarray(HEADER_TEXELS * TEXEL_COMPONENTS);
  const operators =
    sourceWorldVersion === LEGACY_WORLD_VERSION
      ? decodeLegacyOperatorPayload(payload, operatorCount, templateRegistryVersion)
      : decodeV4OperatorPayload(payload, operatorCount, exactInteger(texels[19], "operator payload texels"));
  const base: PromptNoiseTerrainBaseV1 = {
    rootSeed,
    worldNoiseScale: texels[8],
    worldNoiseHeight: texels[9],
    worldNoiseOffset: [texels[10], texels[11], texels[12]],
    ridgeStrength: texels[13],
    ridgeFrequency: texels[14],
    ridgeSharpness: texels[15]
  };
  const common = {
    base,
    operators,
    nextOperatorId: exactInteger(texels[18], "next operator id")
  };
  if ((texels[20] === 0) !== (texels[21] === 0)) {
    throw new RangeError("Prompt-noise River topology counters are incomplete");
  }
  const recipe: PromptNoiseWorldRecipe =
    sourceWorldVersion === LEGACY_WORLD_VERSION
      ? { ...common, version: LEGACY_WORLD_VERSION, templateRegistryVersion }
      : {
          ...common,
          version: PROMPT_NOISE_WORLD_VERSION,
          templateRegistryVersion: 4,
          ...(texels[20] > 0
            ? {
                nextRiverNetworkId: exactInteger(texels[20], "next River network id"),
                nextRiverNodeId: exactInteger(texels[21], "next River node id")
              }
            : {})
        };
  const program = new PromptNoiseTerrainProgram(recipe);
  return Object.freeze({ worldId, program, sourceWorldVersion });
}

function decodeLegacyOperatorPayload(
  payload: Float32Array,
  operatorCount: number,
  templateRegistryVersion: PromptNoiseTemplateRegistryVersion
): readonly PromptNoiseTerrainOperatorV1[] {
  if (templateRegistryVersion >= 4) throw new RangeError("PNW3 cannot use template registry version 4");
  const operatorTexels = persistedOperatorTexels(templateRegistryVersion);
  if (payload.length !== operatorCount * operatorTexels * TEXEL_COMPONENTS) {
    throw new RangeError("Prompt-noise V3 operator payload length is invalid");
  }
  return decodeOperatorTexels(payload, operatorCount, templateRegistryVersion);
}

function encodePromptNoiseV4OperatorTexels(operators: readonly PromptNoiseTerrainOperatorV1[]): Float32Array {
  const normalized = operators.map((operator) => normalizeOperator(operator, 4));
  const texelCount = normalized.reduce(
    (sum, operator) => sum + 5 + (operator.kind === "river" ? operator.controlPoints!.length * 4 : 0),
    0
  );
  const output = new Float32Array(texelCount * TEXEL_COMPONENTS);
  let offset = 0;
  for (const operator of normalized) {
    const recordTexels = 5 + (operator.kind === "river" ? operator.controlPoints!.length * 4 : 0);
    output.set(
      [kindCode(operator.kind), operator.enabled ? 1 : 0, templateCode(operator.templateId), operator.id],
      offset
    );
    output.set([operator.anchor.x, operator.anchor.z, operator.forward.x, operator.forward.z], offset + 4);
    output.set(
      [
        recordTexels,
        operator.kind === "river" ? operator.controlPoints!.length : 0,
        operator.kind === "river" ? operator.nextControlPointId! : 0,
        operator.kind === "river" ? curveModeCode(operator.curveMode!) : 0
      ],
      offset + 8
    );
    if (operator.kind === "river") {
      output.set([operator.length, operator.bend, operator.halfWidth, operator.bankWidth], offset + 12);
      output.set([operator.startHeight, operator.endHeight, operator.bankHeight, operator.strength], offset + 16);
      operator.controlPoints!.forEach((point, pointIndex) => {
        const pointOffset = offset + 20 + pointIndex * 16;
        output.set([point.id, point.position.x, point.position.z, point.bedHeight], pointOffset);
        output.set([point.width, point.depth, point.flowSpeed, point.bankFeather], pointOffset + 4);
        output.set([point.inHandle.x, point.inHandle.z, point.outHandle.x, point.outHandle.z], pointOffset + 8);
        const topology = operator.topology;
        output.set(
          pointIndex === 0 && topology
            ? [topology.networkId, topology.fromNodeId, topology.fromMergeRadius, 0]
            : pointIndex === operator.controlPoints!.length - 1 && topology
              ? [topology.networkId, topology.toNodeId, topology.toMergeRadius, 0]
              : [0, 0, 0, 0],
          pointOffset + 12
        );
      });
    } else if (operator.kind === "flatten") {
      output.set([operator.radius, operator.falloff, operator.targetHeight, operator.strength], offset + 12);
      output.set([0, 0, 0, 0], offset + 16);
    } else {
      output.set([operator.radius, operator.falloff, operator.sampleRadius, operator.strength], offset + 12);
      output.set([0, 0, 0, 0], offset + 16);
    }
    offset += recordTexels * TEXEL_COMPONENTS;
  }
  return output;
}

function decodeV4OperatorPayload(
  payload: Float32Array,
  operatorCount: number,
  declaredPayloadTexels: number
): readonly PromptNoiseTerrainOperatorV1[] {
  if (declaredPayloadTexels * TEXEL_COMPONENTS !== payload.length) {
    throw new RangeError("Prompt-noise V4 operator payload length is invalid");
  }
  const operators: PromptNoiseTerrainOperatorV1[] = [];
  let offset = 0;
  for (let index = 0; index < operatorCount; index++) {
    if (offset + 20 > payload.length) throw new RangeError("Prompt-noise V4 operator record is truncated");
    const kind = codeKind(exactInteger(payload[offset], "operator kind"));
    const recordTexels = exactInteger(payload[offset + 8], "operator record texels");
    const pointCount = exactInteger(payload[offset + 9], "river control point count");
    const expectedRecordTexels = 5 + (kind === "river" ? pointCount * 4 : 0);
    if (recordTexels !== expectedRecordTexels || offset + recordTexels * TEXEL_COMPONENTS > payload.length) {
      throw new RangeError(`Prompt-noise V4 operator ${index} record length is invalid`);
    }
    const common = {
      kind,
      enabled: exactInteger(payload[offset + 1], "operator enabled") !== 0,
      templateId: codeTemplate(exactInteger(payload[offset + 2], "operator template")),
      id: exactInteger(payload[offset + 3], "operator id"),
      anchor: { x: payload[offset + 4], z: payload[offset + 5] },
      forward: { x: payload[offset + 6], z: payload[offset + 7] }
    } as const;
    if (kind === "river") {
      const controlPoints = Array.from({ length: pointCount }, (_, pointIndex) => {
        const pointOffset = offset + 20 + pointIndex * 16;
        return {
          id: exactInteger(payload[pointOffset], "river control point id"),
          position: { x: payload[pointOffset + 1], z: payload[pointOffset + 2] },
          bedHeight: payload[pointOffset + 3],
          width: payload[pointOffset + 4],
          depth: payload[pointOffset + 5],
          flowSpeed: payload[pointOffset + 6],
          bankFeather: payload[pointOffset + 7],
          inHandle: { x: payload[pointOffset + 8], z: payload[pointOffset + 9] },
          outHandle: { x: payload[pointOffset + 10], z: payload[pointOffset + 11] }
        };
      });
      const firstTopologyOffset = offset + 32;
      const lastTopologyOffset = offset + 20 + Math.max(0, pointCount - 1) * 16 + 12;
      const topologyNetworkId = exactInteger(payload[firstTopologyOffset], "River topology network id");
      const mouthTopologyNetworkId = exactInteger(payload[lastTopologyOffset], "River mouth topology network id");
      if (topologyNetworkId !== mouthTopologyNetworkId) {
        throw new RangeError(`Prompt-noise V4 River ${index} topology network ids do not match`);
      }
      const topology =
        topologyNetworkId > 0
          ? {
              networkId: topologyNetworkId,
              fromNodeId: exactInteger(payload[firstTopologyOffset + 1], "River topology source node id"),
              fromMergeRadius: payload[firstTopologyOffset + 2],
              toNodeId: exactInteger(payload[lastTopologyOffset + 1], "River topology mouth node id"),
              toMergeRadius: payload[lastTopologyOffset + 2]
            }
          : undefined;
      operators.push(
        freezeOperator({
          ...common,
          kind,
          length: payload[offset + 12],
          bend: payload[offset + 13],
          halfWidth: payload[offset + 14],
          bankWidth: payload[offset + 15],
          startHeight: payload[offset + 16],
          endHeight: payload[offset + 17],
          bankHeight: payload[offset + 18],
          strength: payload[offset + 19],
          profilePoints: controlPoints.map((point, pointIndex) => ({
            factor: pointIndex / Math.max(1, pointCount - 1),
            width: point.width,
            depth: point.depth,
            flowSpeed: point.flowSpeed,
            bankFeather: point.bankFeather
          })),
          curveMode: codeCurveMode(exactInteger(payload[offset + 11], "river curve mode")),
          nextControlPointId: exactInteger(payload[offset + 10], "next river control point id"),
          controlPoints,
          topology
        })
      );
    } else if (kind === "flatten") {
      operators.push(
        freezeOperator({
          ...common,
          kind,
          radius: payload[offset + 12],
          falloff: payload[offset + 13],
          targetHeight: payload[offset + 14],
          strength: payload[offset + 15]
        })
      );
    } else {
      operators.push(
        freezeOperator({
          ...common,
          kind,
          radius: payload[offset + 12],
          falloff: payload[offset + 13],
          sampleRadius: payload[offset + 14],
          strength: payload[offset + 15]
        })
      );
    }
    offset += recordTexels * TEXEL_COMPONENTS;
  }
  if (offset !== payload.length) throw new RangeError("Prompt-noise V4 operator payload has trailing texels");
  return Object.freeze(operators);
}

/**
 * Encodes active operator records without a world header for direct RGBA32F upload.
 * @param operators Stable active operator sequence.
 * @returns Four legacy texels or seven C2-A source/middle/mouth texels per operator.
 */
export function encodePromptNoiseOperatorTexels(
  operators: readonly PromptNoiseTerrainOperatorV1[],
  templateRegistryVersion: PromptNoiseTemplateRegistryVersion = 2
): Float32Array {
  const operatorTexels = persistedOperatorTexels(templateRegistryVersion);
  const output = new Float32Array(operators.length * operatorTexels * TEXEL_COMPONENTS);
  operators.forEach((candidate, index) => {
    const operator = normalizeOperator(candidate, templateRegistryVersion);
    const offset = index * operatorTexels * TEXEL_COMPONENTS;
    output.set(
      [kindCode(operator.kind), operator.enabled ? 1 : 0, templateCode(operator.templateId), operator.id],
      offset
    );
    output.set([operator.anchor.x, operator.anchor.z, operator.forward.x, operator.forward.z], offset + 4);
    if (operator.kind === "river") {
      output.set([operator.length, operator.bend, operator.halfWidth, operator.bankWidth], offset + 8);
      output.set([operator.startHeight, operator.endHeight, operator.bankHeight, operator.strength], offset + 12);
      if (templateRegistryVersion >= 3) {
        const profilePoints = requireC2APersistenceProfile(operator);
        for (let profileIndex = 0; profileIndex < profilePoints.length; profileIndex++) {
          const point = profilePoints[profileIndex];
          output.set([point.width, point.depth, point.flowSpeed, point.bankFeather], offset + 16 + profileIndex * 4);
        }
      }
    } else if (operator.kind === "flatten") {
      output.set([operator.radius, operator.falloff, operator.targetHeight, operator.strength], offset + 8);
    } else {
      output.set([operator.radius, operator.falloff, operator.sampleRadius, operator.strength], offset + 8);
    }
  });
  return output;
}

/** Fixed-stride GPU table used by the current three-section Terrain shader. */
export function encodePromptNoiseActiveOperatorTexels(
  operators: readonly PromptNoiseTerrainOperatorV1[],
  templateRegistryVersion: PromptNoiseTemplateRegistryVersion
): Float32Array {
  const output = new Float32Array(operators.length * PROMPT_NOISE_C2A_OPERATOR_TEXELS * TEXEL_COMPONENTS);
  operators.forEach((candidate, index) => {
    const operator = normalizeOperator(candidate, templateRegistryVersion);
    const offset = index * PROMPT_NOISE_C2A_OPERATOR_TEXELS * TEXEL_COMPONENTS;
    output.set(
      [kindCode(operator.kind), operator.enabled ? 1 : 0, templateCode(operator.templateId), operator.id],
      offset
    );
    output.set([operator.anchor.x, operator.anchor.z, operator.forward.x, operator.forward.z], offset + 4);
    if (operator.kind === "river") {
      output.set([operator.length, operator.bend, operator.halfWidth, operator.bankWidth], offset + 8);
      output.set([operator.startHeight, operator.endHeight, operator.bankHeight, operator.strength], offset + 12);
      const profilePoints = c2AProfileSlots(operator);
      for (let profileIndex = 0; profileIndex < profilePoints.length; profileIndex++) {
        const point = profilePoints[profileIndex];
        output.set([point.width, point.depth, point.flowSpeed, point.bankFeather], offset + 16 + profileIndex * 4);
      }
    } else if (operator.kind === "flatten") {
      output.set([operator.radius, operator.falloff, operator.targetHeight, operator.strength], offset + 8);
    } else {
      output.set([operator.radius, operator.falloff, operator.sampleRadius, operator.strength], offset + 8);
    }
  });
  return output;
}

/**
 * Computes SHA-256 over canonical bytes with the embedded World ID cleared.
 * @param recipe Complete recipe.
 * @returns Lowercase hexadecimal digest and uint32 candidate lanes.
 */
export async function digestPromptNoiseWorldRecipe(recipe: PromptNoiseWorldRecipe): Promise<{
  readonly sha256: string;
  readonly worldIdCandidates: readonly number[];
}> {
  const bytes = encodePromptNoiseWorldRecipe(recipe, 0).bytes;
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  const view = new DataView(digest.buffer, digest.byteOffset, digest.byteLength);
  const candidates = Array.from({ length: 8 }, (_, index) => view.getUint32(index * 4, false) || index + 1);
  return Object.freeze({
    sha256: [...digest].map((value) => value.toString(16).padStart(2, "0")).join(""),
    worldIdCandidates: Object.freeze(candidates)
  });
}

/**
 * Intersects a ray with the nearest visible analytic terrain surface.
 * @param program Committed or preview terrain program.
 * @param ray Logical world ray.
 * @param maximumDistance Maximum ray parameter to inspect.
 * @returns Nearest hit or `null` when the ray never crosses the height field.
 */
export function intersectPromptNoiseTerrain(
  program: PromptNoiseTerrainProgram,
  ray: PromptNoiseWorldRayV1,
  maximumDistance = 12_000
): PromptNoiseTerrainIntersectionV1 | null {
  const [ox, oy, oz] = ray.origin;
  const [dx, dy, dz] = ray.direction;
  const directionLength = Math.hypot(dx, dy, dz);
  if (
    ![ox, oy, oz, dx, dy, dz, maximumDistance].every(Number.isFinite) ||
    directionLength <= 1e-9 ||
    maximumDistance <= 0
  ) {
    throw new RangeError("Prompt-noise terrain pick ray is invalid");
  }
  const nx = dx / directionLength;
  const ny = dy / directionLength;
  const nz = dz / directionLength;
  const sampleDifference = (distance: number): number => {
    const x = ox + nx * distance;
    const z = oz + nz * distance;
    return oy + ny * distance - program.sampleHeight(x, z);
  };
  let previousDistance = 0;
  let previousDifference = sampleDifference(0);
  const horizontal = Math.hypot(nx, nz);
  const step = Math.max(2, Math.min(16, horizontal > 1e-4 ? 8 / horizontal : 8));
  for (let distance = step; distance <= maximumDistance; distance += step) {
    const difference = sampleDifference(distance);
    if (previousDifference >= 0 && difference <= 0) {
      let lower = previousDistance;
      let upper = distance;
      for (let iteration = 0; iteration < 14; iteration++) {
        const middle = (lower + upper) * 0.5;
        if (sampleDifference(middle) > 0) lower = middle;
        else upper = middle;
      }
      const hitDistance = (lower + upper) * 0.5;
      const x = ox + nx * hitDistance;
      const z = oz + nz * hitDistance;
      return Object.freeze({ x, y: program.sampleHeight(x, z), z, distance: hitDistance });
    }
    previousDistance = distance;
    previousDifference = difference;
  }
  return null;
}

/**
 * Migrates a copied PNW2 code into the ordered V3 program.
 * @param worldCode Existing `pnw2.` world code.
 * @returns V3 program containing the enabled legacy operators.
 */
export function migratePromptNoiseWorldCodeV2(worldCode: string): PromptNoiseTerrainProgram {
  return migratePromptNoiseFormulaV2(decodePromptNoiseWorldCode(worldCode));
}

/**
 * Migrates a detached V2 formula into the ordered V3 program.
 * @param formula Legacy single-operator formula.
 * @returns Frozen V3 program.
 */
export function migratePromptNoiseFormulaV2(formula: PromptNoiseTerrainFormulaV2): PromptNoiseTerrainProgram {
  const operators: PromptNoiseTerrainOperatorV1[] = [];
  let nextOperatorId = 1;
  if (formula.river.enabled) {
    const midpoint = {
      x: (formula.river.start.x + formula.river.end.x) * 0.5,
      z: (formula.river.start.z + formula.river.end.z) * 0.5
    };
    const forward = normalizeDirection({
      x: formula.river.end.x - formula.river.start.x,
      z: formula.river.end.z - formula.river.start.z
    });
    const right = { x: -forward.z, z: forward.x };
    operators.push(
      freezeOperator({
        id: nextOperatorId++,
        enabled: true,
        kind: "river",
        templateId: "river-wide",
        anchor: midpoint,
        forward,
        length: Math.hypot(formula.river.end.x - formula.river.start.x, formula.river.end.z - formula.river.start.z),
        bend: (formula.river.control.x - midpoint.x) * right.x + (formula.river.control.z - midpoint.z) * right.z,
        halfWidth: formula.river.halfWidth,
        bankWidth: formula.river.bankWidth,
        startHeight: formula.river.startHeight,
        endHeight: formula.river.endHeight,
        bankHeight: formula.river.bankHeight,
        strength: formula.river.strength
      })
    );
  }
  if (formula.flatten.enabled) {
    operators.push(
      freezeOperator({
        id: nextOperatorId++,
        enabled: true,
        kind: "flatten",
        templateId: "flatten-plateau",
        anchor: formula.flatten.center,
        forward: { x: 1, z: 0 },
        radius: formula.flatten.radius,
        falloff: formula.flatten.falloff,
        targetHeight: formula.flatten.targetHeight,
        strength: formula.flatten.strength
      })
    );
  }
  if (formula.smooth.enabled) {
    operators.push(
      freezeOperator({
        id: nextOperatorId++,
        enabled: true,
        kind: "smooth",
        templateId: "smooth-strong",
        anchor: formula.smooth.center,
        forward: { x: 1, z: 0 },
        radius: formula.smooth.radius,
        falloff: formula.smooth.falloff,
        sampleRadius: formula.smooth.sampleRadius,
        strength: formula.smooth.strength
      })
    );
  }
  return new PromptNoiseTerrainProgram({
    version: LEGACY_WORLD_VERSION,
    // Legacy PNW2 migration retains the pre-C2 equal-width ClearStream semantics.
    templateRegistryVersion: 2,
    base: {
      rootSeed: formula.rootSeed,
      worldNoiseScale: 9.85,
      worldNoiseHeight: 34,
      worldNoiseOffset: [2.17, -1.225, 1.9],
      ridgeStrength: formula.ridgeStrength,
      ridgeFrequency: formula.ridgeFrequency,
      ridgeSharpness: formula.ridgeSharpness
    },
    operators,
    nextOperatorId
  });
}

/** Deterministically upgrades byte-exact PNW3 authoring data to editable PNW4. */
export function upgradePromptNoiseWorldRecipeV4(recipe: PromptNoiseWorldRecipe): PromptNoiseWorldRecipeV4 {
  if (recipe.version === PROMPT_NOISE_WORLD_VERSION) return normalizePromptNoiseWorldRecipe(recipe);
  return normalizePromptNoiseWorldRecipe({
    ...recipe,
    version: PROMPT_NOISE_WORLD_VERSION,
    templateRegistryVersion: PROMPT_NOISE_TEMPLATE_REGISTRY_VERSION,
    operators: recipe.operators.map((operator) =>
      operator.kind === "river" ? upgradePromptNoiseRiverOperatorV4(operator) : operator
    )
  });
}

/** Builds an explicit PNW3 compatibility recipe for Low, C1, or C2-A replay queries. */
export function createPromptNoiseWorldRecipeV3Compatibility(
  recipe: PromptNoiseWorldRecipe,
  templateRegistryVersion: 1 | 2 | 3
): PromptNoiseWorldRecipeV3 {
  return normalizePromptNoiseWorldRecipe({
    ...recipe,
    version: LEGACY_WORLD_VERSION,
    templateRegistryVersion,
    operators: recipe.operators.map((operator) => {
      if (operator.kind !== "river") return operator;
      const {
        controlPoints: _controlPoints,
        curveMode: _curveMode,
        nextControlPointId: _nextPointId,
        topology: _topology,
        ...legacy
      } = operator;
      if (templateRegistryVersion >= 3) return legacy;
      const { profilePoints: _profilePoints, ...preC2A } = legacy;
      return preC2A;
    })
  });
}

/** Adds a stable point immediately after the selected point without mutating the source operator. */
export function insertPromptNoiseRiverControlPoint(
  operator: PromptNoiseRiverOperatorV1,
  afterPointId: number
): PromptNoiseRiverOperatorV1 {
  const editable = upgradePromptNoiseRiverOperatorV4(operator);
  const points = editable.controlPoints!;
  const leftIndex = points.findIndex((point) => point.id === afterPointId);
  if (leftIndex < 0 || leftIndex >= points.length - 1) {
    throw new RangeError("River control point insertion requires a non-mouth point id");
  }
  const left = points[leftIndex];
  const right = points[leftIndex + 1];
  const nextId = editable.nextControlPointId!;
  let nextLeft = left;
  let nextRight = right;
  let position = midpoint(left.position, right.position);
  let inHandle = position;
  let outHandle = position;
  if (editable.curveMode === "bezier") {
    const a = midpoint(left.position, left.outHandle);
    const b = midpoint(left.outHandle, right.inHandle);
    const c = midpoint(right.inHandle, right.position);
    const d = midpoint(a, b);
    const e = midpoint(b, c);
    position = midpoint(d, e);
    nextLeft = { ...left, outHandle: a };
    nextRight = { ...right, inHandle: c };
    inHandle = d;
    outHandle = e;
  }
  const inserted: PromptNoiseRiverControlPointV1 = {
    id: nextId,
    position,
    bedHeight: mix(left.bedHeight, right.bedHeight, 0.5),
    width: mix(left.width, right.width, 0.5),
    depth: mix(left.depth, right.depth, 0.5),
    flowSpeed: mix(left.flowSpeed, right.flowSpeed, 0.5),
    bankFeather: mix(left.bankFeather, right.bankFeather, 0.5),
    inHandle,
    outHandle
  };
  const controlPoints = [...points];
  controlPoints.splice(leftIndex, 2, nextLeft, inserted, nextRight);
  return rebuildRiverControlPoints(editable, controlPoints, nextId + 1);
}

/** Moves one point and its handles by the same logical XZ delta. */
export function movePromptNoiseRiverControlPoint(
  operator: PromptNoiseRiverOperatorV1,
  pointId: number,
  position: PromptNoiseWorldPointV1
): PromptNoiseRiverOperatorV1 {
  const editable = upgradePromptNoiseRiverOperatorV4(operator);
  const point = editable.controlPoints!.find((entry) => entry.id === pointId);
  if (!point) throw new RangeError(`Unknown River control point ${pointId}`);
  const nextPosition = freezePoint(position);
  const deltaX = nextPosition.x - point.position.x;
  const deltaZ = nextPosition.z - point.position.z;
  return rebuildRiverControlPoints(
    editable,
    editable.controlPoints!.map((entry) =>
      entry.id === pointId
        ? {
            ...entry,
            position: nextPosition,
            inHandle: { x: entry.inHandle.x + deltaX, z: entry.inHandle.z + deltaZ },
            outHandle: { x: entry.outHandle.x + deltaX, z: entry.outHandle.z + deltaZ }
          }
        : entry
    ),
    editable.nextControlPointId!
  );
}

/** Updates hydrology or handle values for one stable point. */
export function updatePromptNoiseRiverControlPoint(
  operator: PromptNoiseRiverOperatorV1,
  pointId: number,
  patch: Partial<Omit<PromptNoiseRiverControlPointV1, "id">>
): PromptNoiseRiverOperatorV1 {
  const editable = upgradePromptNoiseRiverOperatorV4(operator);
  if (!editable.controlPoints!.some((point) => point.id === pointId)) {
    throw new RangeError(`Unknown River control point ${pointId}`);
  }
  return rebuildRiverControlPoints(
    editable,
    editable.controlPoints!.map((point) => (point.id === pointId ? { ...point, ...patch, id: point.id } : point)),
    editable.nextControlPointId!
  );
}

/** Removes an internal point; source and mouth identities are protected. */
export function removePromptNoiseRiverControlPoint(
  operator: PromptNoiseRiverOperatorV1,
  pointId: number
): PromptNoiseRiverOperatorV1 {
  const editable = upgradePromptNoiseRiverOperatorV4(operator);
  const index = editable.controlPoints!.findIndex((point) => point.id === pointId);
  if (index < 0) throw new RangeError(`Unknown River control point ${pointId}`);
  if (index === 0 || index === editable.controlPoints!.length - 1) {
    throw new RangeError("River endpoint control points cannot be removed");
  }
  return rebuildRiverControlPoints(
    editable,
    editable.controlPoints!.filter((point) => point.id !== pointId),
    editable.nextControlPointId!
  );
}

function upgradePromptNoiseRiverOperatorV4(operator: PromptNoiseRiverOperatorV1): PromptNoiseRiverOperatorV1 {
  if (operator.controlPoints && operator.curveMode && operator.nextControlPointId) return operator;
  return freezeOperator({
    ...operator,
    ...createC2BRiverControlPointState(
      operator.anchor,
      operator.forward,
      operator.length,
      operator.bend,
      operator.startHeight,
      operator.endHeight,
      c2AProfileSlots(operator)
    )
  });
}

function rebuildRiverControlPoints(
  operator: PromptNoiseRiverOperatorV1,
  controlPoints: readonly PromptNoiseRiverControlPointV1[],
  nextControlPointId: number
): PromptNoiseRiverOperatorV1 {
  const profilePoints = controlPoints.map((point, index) => ({
    factor: index / Math.max(1, controlPoints.length - 1),
    width: point.width,
    depth: point.depth,
    flowSpeed: point.flowSpeed,
    bankFeather: point.bankFeather
  }));
  return normalizeOperator(
    {
      ...operator,
      controlPoints,
      nextControlPointId,
      profilePoints,
      halfWidth: Math.max(...controlPoints.map((point) => point.width)) * 0.5,
      startHeight: controlPoints[0].bedHeight,
      endHeight: controlPoints[controlPoints.length - 1].bedHeight
    },
    4
  ) as PromptNoiseRiverOperatorV1;
}

/**
 * Returns the exact compact-support bounds of one operator.
 * @param operator Local terrain operator.
 * @returns Inclusive logical bounds in metres.
 */
export function operatorBounds(operator: PromptNoiseTerrainOperatorV1): PromptNoiseOperatorBoundsV1 {
  if (operator.kind === "river") {
    if (operator.controlPoints) return compiledRiverField(operator).bounds;
    const curve = riverCurve(operator);
    const support =
      Math.max(...resolvePromptNoiseRiverProfilePoints(operator).map(({ width }) => width * 0.5)) + operator.bankWidth;
    const minX = Math.min(curve.start.x, curve.control.x, curve.end.x) - support;
    const minZ = Math.min(curve.start.z, curve.control.z, curve.end.z) - support;
    const maxX = Math.max(curve.start.x, curve.control.x, curve.end.x) + support;
    const maxZ = Math.max(curve.start.z, curve.control.z, curve.end.z) + support;
    return Object.freeze({ minX, minZ, maxX, maxZ });
  }
  const halo = operator.kind === "smooth" ? operator.radius + operator.sampleRadius : operator.radius;
  return Object.freeze({
    minX: operator.anchor.x - halo,
    minZ: operator.anchor.z - halo,
    maxX: operator.anchor.x + halo,
    maxZ: operator.anchor.z + halo
  });
}

/** Returns one detached interpolated River section from the generic profile array. */
export function samplePromptNoiseRiverProfile(
  operator: PromptNoiseRiverOperatorV1,
  factor: number
): PromptNoiseRiverProfilePointV1 {
  if (!Number.isFinite(factor)) throw new RangeError("Prompt-noise River profile factor must be finite");
  const clampedFactor = clamp01(factor);
  const points = resolvePromptNoiseRiverProfilePoints(operator);
  if (clampedFactor <= points[0].factor) return Object.freeze({ ...points[0], factor: clampedFactor });
  for (let index = 1; index < points.length; index++) {
    const right = points[index];
    if (clampedFactor > right.factor) continue;
    const left = points[index - 1];
    const span = Math.max(1e-8, right.factor - left.factor);
    const localFactor = (clampedFactor - left.factor) / span;
    return Object.freeze({
      factor: clampedFactor,
      width: mix(left.width, right.width, localFactor),
      depth: mix(left.depth, right.depth, localFactor),
      flowSpeed: mix(left.flowSpeed, right.flowSpeed, localFactor),
      bankFeather: mix(left.bankFeather, right.bankFeather, localFactor)
    });
  }
  return Object.freeze({ ...points[points.length - 1], factor: clampedFactor });
}

/** Resolves legacy equal-width operators into the same generic profile contract. */
export function resolvePromptNoiseRiverProfilePoints(
  operator: PromptNoiseRiverOperatorV1
): readonly PromptNoiseRiverProfilePointV1[] {
  return operator.profilePoints ?? legacyRiverProfilePoints(operator);
}

/**
 * Returns editable defaults for one template.
 * @param templateId Stable template identity.
 * @returns Detached parameter object.
 */
export function promptNoiseTemplateParameters(
  templateId: PromptNoiseOperatorTemplateId
): PromptNoisePlacementParametersV1 {
  const value = PROMPT_NOISE_OPERATOR_TEMPLATES[templateId];
  if (!value) throw new RangeError(`Unknown prompt-noise operator template ${JSON.stringify(templateId)}`);
  return { ...value };
}

function samplePromptNoiseHeight(recipe: PromptNoiseWorldRecipe, worldX: number, worldZ: number): number {
  if (!Number.isFinite(worldX) || !Number.isFinite(worldZ))
    throw new RangeError("Prompt-noise sample coordinates must be finite");
  const shapeHeight = sampleShapeHeight(recipe, worldX, worldZ);
  let height = shapeHeight;
  for (const operator of recipe.operators) {
    if (!operator.enabled || operator.kind !== "smooth") continue;
    const influence =
      diskWeight(worldX, worldZ, operator.anchor, operator.radius, operator.falloff) *
      (1 - riverCorridorWeight(recipe, worldX, worldZ));
    if (influence <= 0) continue;
    const radius = operator.sampleRadius;
    const average =
      (shapeHeight +
        sampleShapeHeight(recipe, worldX + radius, worldZ) +
        sampleShapeHeight(recipe, worldX - radius, worldZ) +
        sampleShapeHeight(recipe, worldX, worldZ + radius) +
        sampleShapeHeight(recipe, worldX, worldZ - radius)) *
      0.2;
    height = mix(height, average, influence * operator.strength);
  }
  return height;
}

/** Smooth is prohibited from changing the published River bed and shoreline corridor. */
function riverCorridorWeight(recipe: PromptNoiseWorldRecipe, worldX: number, worldZ: number): number {
  let weight = 0;
  for (const operator of recipe.operators) {
    if (!operator.enabled || operator.kind !== "river") continue;
    const closest = operator.controlPoints
      ? samplePromptNoiseRiverField(compiledRiverField(operator), worldX, worldZ)
      : legacyRiverSample(operator, worldX, worldZ);
    const bankFactor = clamp01((closest.distance - closest.width * 0.5) / Math.max(operator.bankWidth, 1e-5));
    weight = Math.max(weight, 1 - smoothStep01(bankFactor));
  }
  return weight;
}

function smoothStep01(value: number): number {
  const clamped = clamp01(value);
  return clamped * clamped * (3 - 2 * clamped);
}

function sampleShapeHeight(recipe: PromptNoiseWorldRecipe, worldX: number, worldZ: number): number {
  let height = stochasticHeight(recipe.base, worldX, worldZ);
  for (const operator of recipe.operators) {
    if (!operator.enabled || operator.kind === "smooth") continue;
    if (operator.kind === "river") {
      const fieldSample = operator.controlPoints
        ? samplePromptNoiseRiverField(compiledRiverField(operator), worldX, worldZ)
        : undefined;
      const closest = fieldSample ?? legacyRiverSample(operator, worldX, worldZ);
      const bankFactor = clamp01((closest.distance - closest.width * 0.5) / operator.bankWidth);
      const influence = 1 - Math.pow(bankFactor, Math.max(operator.strength, 0.05));
      const riverHeight = fieldSample
        ? promptNoiseRiverTerrainCrossSectionHeight(
            fieldSample.distance,
            fieldSample.width,
            fieldSample.bedHeight,
            fieldSample.depth,
            fieldSample.bankFeather,
            operator.bankWidth,
            operator.bankHeight
          )
        : closest.bedHeight + operator.bankHeight * bankFactor * bankFactor;
      height = mix(height, riverHeight, influence);
    } else {
      const influence = diskWeight(worldX, worldZ, operator.anchor, operator.radius, operator.falloff);
      height = mix(height, operator.targetHeight, influence * operator.strength);
    }
  }
  return height;
}

/**
 * Keeps the semantic wet boundary and the Terrain-water intersection identical.
 * The submerged bank rises to surfaceY inside halfWidth; the dry bank then rises
 * above the render surface within bankFeather so the render-only water apron is
 * always depth-occluded by Terrain.
 */
function promptNoiseRiverTerrainCrossSectionHeight(
  distance: number,
  width: number,
  bedHeight: number,
  depth: number,
  bankFeather: number,
  bankWidth: number,
  bankHeight: number
): number {
  const halfWidth = width * 0.5;
  const surfaceHeight = bedHeight + depth;
  const submergedBankWidth = Math.min(halfWidth, Math.max(bankFeather, depth));
  const submergedBankFactor = smoothStep01(
    (distance - (halfWidth - submergedBankWidth)) / Math.max(submergedBankWidth, 1e-5)
  );
  if (distance <= halfWidth) return mix(bedHeight, surfaceHeight, submergedBankFactor);

  const dryDistance = distance - halfWidth;
  const dryShoreFactor = smoothStep01(dryDistance / Math.max(bankFeather, 0.05));
  const bankFactor = clamp01(dryDistance / Math.max(bankWidth, 1e-5));
  const shoreProtectionHeight = Math.max(0.12, depth * 0.25);
  return surfaceHeight + shoreProtectionHeight * dryShoreFactor + bankHeight * bankFactor * bankFactor;
}

function legacyRiverSample(
  operator: PromptNoiseRiverOperatorV1,
  worldX: number,
  worldZ: number
): Readonly<{ distance: number; factor: number; width: number; bedHeight: number }> {
  const curve = riverCurve(operator);
  const closest = quadraticBezierDistance({ x: worldX, z: worldZ }, curve.start, curve.control, curve.end);
  return {
    ...closest,
    width: samplePromptNoiseRiverProfile(operator, closest.factor).width,
    bedHeight: mix(operator.startHeight, operator.endHeight, closest.factor)
  };
}

function compiledRiverField(operator: PromptNoiseRiverOperatorV1): PromptNoiseRiverFieldV1 {
  let field = RIVER_FIELD_CACHE.get(operator);
  if (!field) {
    field = PromptNoiseRiverFieldCompiler.compile(operator);
    RIVER_FIELD_CACHE.set(operator, field);
  }
  return field;
}

function stochasticHeight(base: PromptNoiseTerrainBaseV1, worldX: number, worldZ: number): number {
  const seedOffset = promptNoiseFbmSeedOffset(base.rootSeed);
  const noiseX = ((worldX + 0.5) / 1024 + base.worldNoiseOffset[0] + seedOffset[0]) * base.worldNoiseScale * 0.1;
  const noiseZ = ((worldZ + 0.5) / 1024 + base.worldNoiseOffset[2] + seedOffset[1]) * base.worldNoiseScale * 0.1;
  return (
    referenceFbm(noiseX, noiseZ) * base.worldNoiseHeight * 10 +
    base.worldNoiseOffset[1] * 100 +
    continuousRidges(base, worldX, worldZ) * base.ridgeStrength
  );
}

/**
 * Maps a world seed to a whole-cell FBM translation without changing the Terrain3D frequency spectrum.
 * @param rootSeed Unsigned world seed; zero reproduces Terrain3D's authored coordinates exactly.
 * @returns Deterministic XZ offsets in Terrain3D region-space units.
 */
export function promptNoiseFbmSeedOffset(rootSeed: number): readonly [x: number, z: number] {
  if (rootSeed >>> 0 === 0) return Object.freeze([0, 0] as const);
  const x = (hashPromptNoise(rootSeed, 0x4642_4d58) & 0x3ff) - 512;
  const z = (hashPromptNoise(rootSeed, 0x4642_4d5a) & 0x3ff) - 512;
  return Object.freeze([x, z] as const);
}

function referenceFbm(x: number, z: number): number {
  let amplitude = 0;
  let weight = 1;
  let derivativeX = 0;
  let derivativeZ = 0;
  for (let octave = 0; octave < 4; octave++) {
    const noise = referenceNoise(x, z);
    derivativeX += noise.derivativeX;
    derivativeZ += noise.derivativeZ;
    amplitude += (weight * noise.value) / (1 + derivativeX * derivativeX + derivativeZ * derivativeZ);
    weight *= 0.5;
    const nextX = (0.8 * x + 0.6 * z) * 2;
    const nextZ = (-0.6 * x + 0.8 * z) * 2;
    x = nextX;
    z = nextZ;
  }
  return amplitude;
}

function referenceNoise(x: number, z: number): { value: number; derivativeX: number; derivativeZ: number } {
  const fx = fract(x);
  const fz = fract(z);
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const ux = fx ** 3 * (fx * (fx * 6 - 15) + 10);
  const uz = fz ** 3 * (fz * (fz * 6 - 15) + 10);
  const dux = 30 * fx ** 2 * (fx - 1) ** 2;
  const duz = 30 * fz ** 2 * (fz - 1) ** 2;
  const a = referenceHash(ix, iz);
  const b = referenceHash(ix + 1, iz);
  const c = referenceHash(ix, iz + 1);
  const d = referenceHash(ix + 1, iz + 1);
  const k1 = b - a;
  const k2 = c - a;
  const k3 = d - b - k2;
  return {
    value: k2 * uz + ux * (k3 * uz + k1) + a,
    derivativeX: dux * (k3 * uz + k1),
    derivativeZ: duz * (k3 * ux + k2)
  };
}

function referenceHash(x: number, z: number): number {
  return fract(10_000 * Math.sin(17 * x + z * 0.1) * (0.1 + Math.abs(Math.sin(z * 13 + x))));
}

function continuousRidges(base: PromptNoiseTerrainBaseV1, worldX: number, worldZ: number): number {
  const cellSize = 1 / base.ridgeFrequency;
  const sourceX = Math.floor(worldX / cellSize);
  const sourceZ = Math.floor(worldZ / cellSize);
  const ridgeSeed = hashPromptNoise(base.rootSeed, 0x5249_4447);
  let ridge = 0;
  for (let offsetZ = -1; offsetZ <= 1; offsetZ++) {
    for (let offsetX = -1; offsetX <= 1; offsetX++) {
      ridge = Math.max(
        ridge,
        ridgeStroke(base, ridgeSeed, worldX, worldZ, sourceX + offsetX, sourceZ + offsetZ, cellSize)
      );
    }
  }
  const detail = seededValue(worldX * base.ridgeFrequency * 7, worldZ * base.ridgeFrequency * 7, ridgeSeed, 97);
  return ridge * mix(0.82, 1, detail);
}

function ridgeStroke(
  base: PromptNoiseTerrainBaseV1,
  seed: number,
  worldX: number,
  worldZ: number,
  cellX: number,
  cellZ: number,
  cellSize: number
): number {
  const angle = seededCell(cellX, cellZ, seed, 17) * Math.PI * 2;
  const directionX = Math.cos(angle);
  const directionZ = Math.sin(angle);
  const perpendicularX = -directionZ;
  const perpendicularZ = directionX;
  const centerX = (cellX + 0.5 + (seededCell(cellX, cellZ, seed, 29) - 0.5) * 0.42) * cellSize;
  const centerZ = (cellZ + 0.5 + (seededCell(cellX, cellZ, seed, 43) - 0.5) * 0.42) * cellSize;
  const halfLength = cellSize * mix(0.72, 1.18, seededCell(cellX, cellZ, seed, 59)) * 0.5;
  const bend = cellSize * mix(-0.24, 0.24, seededCell(cellX, cellZ, seed, 71));
  const start = { x: centerX - directionX * halfLength, z: centerZ - directionZ * halfLength };
  const middle = { x: centerX + perpendicularX * bend, z: centerZ + perpendicularZ * bend };
  const end = { x: centerX + directionX * halfLength, z: centerZ + directionZ * halfLength };
  const distance = Math.min(
    segmentDistance(worldX, worldZ, start, middle),
    segmentDistance(worldX, worldZ, middle, end)
  );
  const width = cellSize * mix(0.14, 0.22, seededCell(cellX, cellZ, seed, 83));
  const profile = smoothstep(1, 0, distance / width);
  return profile ** Math.max(1, base.ridgeSharpness * 0.25);
}

function seededCell(cellX: number, cellZ: number, seed: number, octave: number): number {
  let hash = seedMix(seed >>> 0, octave);
  hash = seedMix(hash, cellX);
  hash = seedMix(hash, cellZ);
  return (hash & 0x00ff_ffff) / 16_777_215;
}

function seededValue(x: number, z: number, seed: number, octave: number): number {
  const fx = fract(x);
  const fz = fract(z);
  const ux = fx ** 3 * (fx * (fx * 6 - 15) + 10);
  const uz = fz ** 3 * (fz * (fz * 6 - 15) + 10);
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  return mix(
    mix(seededCell(ix, iz, seed, octave), seededCell(ix + 1, iz, seed, octave), ux),
    mix(seededCell(ix, iz + 1, seed, octave), seededCell(ix + 1, iz + 1, seed, octave), ux),
    uz
  );
}

function seedMix(hash: number, value: number): number {
  hash = (hash ^ Math.imul(value | 0, 0x9e37_79b9)) >>> 0;
  hash = (hash ^ (hash >>> 16)) >>> 0;
  hash = Math.imul(hash, 0x7feb_352d) >>> 0;
  hash = (hash ^ (hash >>> 15)) >>> 0;
  hash = Math.imul(hash, 0x846c_a68b) >>> 0;
  return (hash ^ (hash >>> 16)) >>> 0;
}

function riverCurve(operator: PromptNoiseRiverOperatorV1): {
  start: PromptNoiseWorldPointV1;
  control: PromptNoiseWorldPointV1;
  end: PromptNoiseWorldPointV1;
} {
  const halfLength = operator.length * 0.5;
  const right = { x: -operator.forward.z, z: operator.forward.x };
  return {
    start: {
      x: operator.anchor.x - operator.forward.x * halfLength,
      z: operator.anchor.z - operator.forward.z * halfLength
    },
    control: { x: operator.anchor.x + right.x * operator.bend, z: operator.anchor.z + right.z * operator.bend },
    end: {
      x: operator.anchor.x + operator.forward.x * halfLength,
      z: operator.anchor.z + operator.forward.z * halfLength
    }
  };
}

function quadraticBezierDistance(
  point: PromptNoiseWorldPointV1,
  start: PromptNoiseWorldPointV1,
  control: PromptNoiseWorldPointV1,
  end: PromptNoiseWorldPointV1
): { distance: number; factor: number } {
  let bestDistance = Number.POSITIVE_INFINITY;
  let bestFactor = 0;
  let segmentStart = start;
  for (let index = 1; index <= RIVER_SEGMENTS; index++) {
    const endFactor = index / RIVER_SEGMENTS;
    const segmentEnd = bezierPoint(start, control, end, endFactor);
    const segmentX = segmentEnd.x - segmentStart.x;
    const segmentZ = segmentEnd.z - segmentStart.z;
    const localFactor = clamp01(
      ((point.x - segmentStart.x) * segmentX + (point.z - segmentStart.z) * segmentZ) /
        Math.max(segmentX * segmentX + segmentZ * segmentZ, 0.0001)
    );
    const candidateX = mix(segmentStart.x, segmentEnd.x, localFactor);
    const candidateZ = mix(segmentStart.z, segmentEnd.z, localFactor);
    const distance = Math.hypot(point.x - candidateX, point.z - candidateZ);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestFactor = (index - 1 + localFactor) / RIVER_SEGMENTS;
    }
    segmentStart = segmentEnd;
  }
  return { distance: bestDistance, factor: bestFactor };
}

function bezierPoint(
  start: PromptNoiseWorldPointV1,
  control: PromptNoiseWorldPointV1,
  end: PromptNoiseWorldPointV1,
  factor: number
): PromptNoiseWorldPointV1 {
  const inverse = 1 - factor;
  return {
    x: inverse * inverse * start.x + 2 * inverse * factor * control.x + factor * factor * end.x,
    z: inverse * inverse * start.z + 2 * inverse * factor * control.z + factor * factor * end.z
  };
}

function segmentDistance(
  worldX: number,
  worldZ: number,
  start: PromptNoiseWorldPointV1,
  end: PromptNoiseWorldPointV1
): number {
  const segmentX = end.x - start.x;
  const segmentZ = end.z - start.z;
  const factor = clamp01(
    ((worldX - start.x) * segmentX + (worldZ - start.z) * segmentZ) /
      Math.max(segmentX * segmentX + segmentZ * segmentZ, 0.0001)
  );
  return Math.hypot(worldX - mix(start.x, end.x, factor), worldZ - mix(start.z, end.z, factor));
}

function diskWeight(
  worldX: number,
  worldZ: number,
  center: PromptNoiseWorldPointV1,
  radius: number,
  falloff: number
): number {
  return 1 - smoothstep(Math.max(radius - falloff, 0), radius, Math.hypot(worldX - center.x, worldZ - center.z));
}

function persistedOperatorTexels(templateRegistryVersion: PromptNoiseTemplateRegistryVersion): number {
  if (!SUPPORTED_TEMPLATE_REGISTRY_VERSIONS.includes(templateRegistryVersion)) {
    throw new RangeError("Prompt-noise template registry version is unsupported");
  }
  return templateRegistryVersion >= 3 ? PROMPT_NOISE_C2A_OPERATOR_TEXELS : LEGACY_OPERATOR_TEXELS;
}

function createC2ARiverProfilePoints(
  parameters: PromptNoisePlacementParametersV1
): readonly PromptNoiseRiverProfilePointV1[] {
  return normalizeRiverProfilePoints([
    {
      factor: 0,
      width: parameters.sourceWidth,
      depth: parameters.sourceDepth,
      flowSpeed: parameters.sourceFlowSpeed,
      bankFeather: parameters.sourceBankFeather
    },
    {
      factor: 0.5,
      width: parameters.middleWidth,
      depth: parameters.middleDepth,
      flowSpeed: parameters.middleFlowSpeed,
      bankFeather: parameters.middleBankFeather
    },
    {
      factor: 1,
      width: parameters.mouthWidth,
      depth: parameters.mouthDepth,
      flowSpeed: parameters.mouthFlowSpeed,
      bankFeather: parameters.mouthBankFeather
    }
  ]);
}

function createC2BRiverControlPointState(
  anchor: PromptNoiseWorldPointV1,
  forward: PromptNoiseWorldPointV1,
  length: number,
  bend: number,
  startHeight: number,
  endHeight: number,
  profilePoints: readonly PromptNoiseRiverProfilePointV1[]
): Readonly<{
  curveMode: "bezier";
  controlPoints: readonly PromptNoiseRiverControlPointV1[];
  nextControlPointId: number;
}> {
  const halfLength = length * 0.5;
  const right = { x: -forward.z, z: forward.x };
  const start = { x: anchor.x - forward.x * halfLength, z: anchor.z - forward.z * halfLength };
  const control = { x: anchor.x + right.x * bend, z: anchor.z + right.z * bend };
  const end = { x: anchor.x + forward.x * halfLength, z: anchor.z + forward.z * halfLength };
  const factors = [0, 0.5, 1] as const;
  const curvePoints = factors.map((factor) => quadraticPoint2D(start, control, end, factor));
  const derivatives = factors.map((factor) => quadraticDerivative2D(start, control, end, factor));
  const sampledProfiles = factors.map((factor) => sampleRiverProfilePoints(profilePoints, factor));
  const controlPoints = factors.map((factor, index): PromptNoiseRiverControlPointV1 => {
    const previousFactor = factors[index - 1];
    const nextFactor = factors[index + 1];
    const point = curvePoints[index];
    const profile = sampledProfiles[index];
    return {
      id: index + 1,
      position: point,
      bedHeight: mix(startHeight, endHeight, factor),
      width: profile.width,
      depth: profile.depth,
      flowSpeed: profile.flowSpeed,
      bankFeather: profile.bankFeather,
      inHandle:
        previousFactor === undefined
          ? point
          : {
              x: point.x - derivatives[index].x * ((factor - previousFactor) / 3),
              z: point.z - derivatives[index].z * ((factor - previousFactor) / 3)
            },
      outHandle:
        nextFactor === undefined
          ? point
          : {
              x: point.x + derivatives[index].x * ((nextFactor - factor) / 3),
              z: point.z + derivatives[index].z * ((nextFactor - factor) / 3)
            }
    };
  });
  return deepFreeze({ curveMode: "bezier" as const, controlPoints, nextControlPointId: 4 });
}

function sampleRiverProfilePoints(
  points: readonly PromptNoiseRiverProfilePointV1[],
  factor: number
): PromptNoiseRiverProfilePointV1 {
  if (factor <= points[0].factor) return points[0];
  for (let index = 1; index < points.length; index++) {
    const right = points[index];
    if (factor > right.factor) continue;
    const left = points[index - 1];
    const localFactor = (factor - left.factor) / Math.max(1e-8, right.factor - left.factor);
    return {
      factor,
      width: mix(left.width, right.width, localFactor),
      depth: mix(left.depth, right.depth, localFactor),
      flowSpeed: mix(left.flowSpeed, right.flowSpeed, localFactor),
      bankFeather: mix(left.bankFeather, right.bankFeather, localFactor)
    };
  }
  return points[points.length - 1];
}

function quadraticPoint2D(
  start: PromptNoiseWorldPointV1,
  control: PromptNoiseWorldPointV1,
  end: PromptNoiseWorldPointV1,
  factor: number
): PromptNoiseWorldPointV1 {
  const inverse = 1 - factor;
  return {
    x: inverse * inverse * start.x + 2 * inverse * factor * control.x + factor * factor * end.x,
    z: inverse * inverse * start.z + 2 * inverse * factor * control.z + factor * factor * end.z
  };
}

function quadraticDerivative2D(
  start: PromptNoiseWorldPointV1,
  control: PromptNoiseWorldPointV1,
  end: PromptNoiseWorldPointV1,
  factor: number
): PromptNoiseWorldPointV1 {
  return {
    x: 2 * (1 - factor) * (control.x - start.x) + 2 * factor * (end.x - control.x),
    z: 2 * (1 - factor) * (control.z - start.z) + 2 * factor * (end.z - control.z)
  };
}

function legacyRiverProfilePoints(operator: PromptNoiseRiverOperatorV1): readonly PromptNoiseRiverProfilePointV1[] {
  const depth = Math.min(
    PROMPT_NOISE_CLEAR_STREAM_HIGH_PROFILE_V1.depth.maximum,
    Math.max(
      PROMPT_NOISE_CLEAR_STREAM_HIGH_PROFILE_V1.depth.minimum,
      operator.bankHeight * PROMPT_NOISE_CLEAR_STREAM_HIGH_PROFILE_V1.depth.bankHeightRatio
    )
  );
  const point = {
    width: operator.halfWidth * 2,
    depth,
    flowSpeed: PROMPT_NOISE_CLEAR_STREAM_HIGH_PROFILE_V1.flowSpeed,
    bankFeather: Math.min(operator.bankWidth, PROMPT_NOISE_CLEAR_STREAM_HIGH_PROFILE_V1.maximumBankFeather)
  };
  return deepFreeze([
    { factor: 0, ...point },
    { factor: 1, ...point }
  ]);
}

function normalizeRiverProfilePoints(
  points: readonly PromptNoiseRiverProfilePointV1[]
): readonly PromptNoiseRiverProfilePointV1[] {
  if (points.length < RIVER_LIMITS.minPointCount) {
    throw new RangeError("Prompt-noise River profile point count is invalid");
  }
  const normalized = points.map((point, index) => {
    if (
      !Number.isFinite(point.factor) ||
      point.factor < 0 ||
      point.factor > 1 ||
      !Number.isFinite(point.width) ||
      point.width < RIVER_LIMITS.minWidth ||
      point.width > RIVER_LIMITS.maxWidth ||
      !Number.isFinite(point.depth) ||
      point.depth < RIVER_LIMITS.minDepth ||
      point.depth > RIVER_LIMITS.maxDepth ||
      !Number.isFinite(point.flowSpeed) ||
      point.flowSpeed < RIVER_LIMITS.minFlowSpeed ||
      point.flowSpeed > RIVER_LIMITS.maxFlowSpeed ||
      !Number.isFinite(point.bankFeather) ||
      point.bankFeather < RIVER_LIMITS.minBankFeather ||
      point.bankFeather > RIVER_LIMITS.maxBankFeather ||
      (index > 0 && point.factor <= points[index - 1].factor)
    ) {
      throw new RangeError(`Prompt-noise River profile point ${index} is invalid`);
    }
    return {
      factor: Math.fround(point.factor),
      width: Math.fround(point.width),
      depth: Math.fround(point.depth),
      flowSpeed: Math.fround(point.flowSpeed),
      bankFeather: Math.fround(point.bankFeather)
    };
  });
  if (normalized[0].factor !== 0 || normalized[normalized.length - 1].factor !== 1) {
    throw new RangeError("Prompt-noise River profile must include source factor 0 and mouth factor 1");
  }
  return deepFreeze(normalized);
}

function requireC2APersistenceProfile(
  operator: PromptNoiseRiverOperatorV1
): readonly [PromptNoiseRiverProfilePointV1, PromptNoiseRiverProfilePointV1, PromptNoiseRiverProfilePointV1] {
  const points = operator.profilePoints;
  if (points?.length !== 3 || points[0].factor !== 0 || points[1].factor !== 0.5 || points[2].factor !== 1) {
    throw new RangeError("C2-A persistence requires source, middle, and mouth River profile points");
  }
  return points as readonly [
    PromptNoiseRiverProfilePointV1,
    PromptNoiseRiverProfilePointV1,
    PromptNoiseRiverProfilePointV1
  ];
}

function c2AProfileSlots(
  operator: PromptNoiseRiverOperatorV1
): readonly [PromptNoiseRiverProfilePointV1, PromptNoiseRiverProfilePointV1, PromptNoiseRiverProfilePointV1] {
  return [
    samplePromptNoiseRiverProfile(operator, 0),
    samplePromptNoiseRiverProfile(operator, 0.5),
    samplePromptNoiseRiverProfile(operator, 1)
  ];
}

function decodeOperatorTexels(
  texels: Float32Array,
  operatorCount: number,
  templateRegistryVersion: PromptNoiseTemplateRegistryVersion
): readonly PromptNoiseTerrainOperatorV1[] {
  const operatorTexels = persistedOperatorTexels(templateRegistryVersion);
  const operators: PromptNoiseTerrainOperatorV1[] = [];
  for (let index = 0; index < operatorCount; index++) {
    const offset = index * operatorTexels * TEXEL_COMPONENTS;
    const kind = codeKind(exactInteger(texels[offset], "operator kind"));
    const enabled = exactInteger(texels[offset + 1], "operator enabled") !== 0;
    const templateId = codeTemplate(exactInteger(texels[offset + 2], "operator template"));
    const id = exactInteger(texels[offset + 3], "operator id");
    const common = {
      id,
      enabled,
      kind,
      templateId,
      anchor: { x: texels[offset + 4], z: texels[offset + 5] },
      forward: { x: texels[offset + 6], z: texels[offset + 7] }
    } as const;
    if (kind === "river") {
      operators.push(
        freezeOperator({
          ...common,
          kind,
          length: texels[offset + 8],
          bend: texels[offset + 9],
          halfWidth: texels[offset + 10],
          bankWidth: texels[offset + 11],
          startHeight: texels[offset + 12],
          endHeight: texels[offset + 13],
          bankHeight: texels[offset + 14],
          strength: texels[offset + 15],
          profilePoints:
            templateRegistryVersion >= 3
              ? ([0, 0.5, 1] as const).map((factor, profileIndex) => {
                  const profileOffset = offset + 16 + profileIndex * 4;
                  return {
                    factor,
                    width: texels[profileOffset],
                    depth: texels[profileOffset + 1],
                    flowSpeed: texels[profileOffset + 2],
                    bankFeather: texels[profileOffset + 3]
                  };
                })
              : undefined
        })
      );
    } else if (kind === "flatten") {
      operators.push(
        freezeOperator({
          ...common,
          kind,
          radius: texels[offset + 8],
          falloff: texels[offset + 9],
          targetHeight: texels[offset + 10],
          strength: texels[offset + 11]
        })
      );
    } else {
      operators.push(
        freezeOperator({
          ...common,
          kind,
          radius: texels[offset + 8],
          falloff: texels[offset + 9],
          sampleRadius: texels[offset + 10],
          strength: texels[offset + 11]
        })
      );
    }
  }
  return Object.freeze(operators);
}

function normalizeOperator(
  operator: PromptNoiseTerrainOperatorV1,
  templateRegistryVersion: PromptNoiseTemplateRegistryVersion
): PromptNoiseTerrainOperatorV1 {
  if (!Number.isInteger(operator.id) || operator.id < 1 || operator.id > MAX_EXACT_FLOAT_INTEGER) {
    throw new RangeError("Prompt-noise operator id is invalid");
  }
  assertTemplateKind(operator.templateId, operator.kind);
  const anchor = freezePoint(operator.anchor);
  const forward = normalizeDirection(operator.forward);
  if (!isUnitInterval(operator.strength)) throw new RangeError("Prompt-noise operator strength is invalid");
  if (operator.kind === "river") {
    if (
      !isPositiveFinite(operator.length) ||
      !Number.isFinite(operator.bend) ||
      !isPositiveFinite(operator.halfWidth) ||
      !isPositiveFinite(operator.bankWidth) ||
      !Number.isFinite(operator.startHeight) ||
      !Number.isFinite(operator.endHeight) ||
      !isNonNegativeFinite(operator.bankHeight)
    )
      throw new RangeError("Prompt-noise river operator is invalid");
    const {
      profilePoints: _profilePoints,
      controlPoints: _controlPoints,
      curveMode: _curveMode,
      nextControlPointId: _nextControlPointId,
      topology: _topology,
      ...legacyOperator
    } = operator;
    const controlPointState = templateRegistryVersion >= 4 ? normalizeRiverControlPointState(operator) : undefined;
    const topology = templateRegistryVersion >= 4 ? normalizeRiverReachTopology(operator.topology) : undefined;
    const profilePoints =
      templateRegistryVersion >= 4
        ? controlPointState!.controlPoints.map((point, index, points) => ({
            factor: index / Math.max(1, points.length - 1),
            width: point.width,
            depth: point.depth,
            flowSpeed: point.flowSpeed,
            bankFeather: point.bankFeather
          }))
        : templateRegistryVersion >= 3
          ? normalizeRiverProfilePoints(operator.profilePoints ?? legacyRiverProfilePoints(operator))
          : undefined;
    const normalized = {
      ...legacyOperator,
      anchor,
      forward,
      length: Math.fround(operator.length),
      bend: Math.fround(operator.bend),
      halfWidth: Math.fround(operator.halfWidth),
      bankWidth: Math.fround(operator.bankWidth),
      startHeight: Math.fround(operator.startHeight),
      endHeight: Math.fround(operator.endHeight),
      bankHeight: Math.fround(operator.bankHeight),
      strength: Math.fround(operator.strength)
    };
    return freezeOperator(
      controlPointState
        ? { ...normalized, profilePoints, ...controlPointState, ...(topology ? { topology } : {}) }
        : profilePoints
          ? { ...normalized, profilePoints }
          : normalized
    );
  }
  if (!isPositiveFinite(operator.radius) || !isPositiveFinite(operator.falloff) || operator.falloff > operator.radius) {
    throw new RangeError(`Prompt-noise ${operator.kind} operator radius is invalid`);
  }
  if (operator.kind === "flatten") {
    if (!Number.isFinite(operator.targetHeight)) throw new RangeError("Prompt-noise flatten target height is invalid");
    return freezeOperator({
      ...operator,
      anchor,
      forward,
      radius: Math.fround(operator.radius),
      falloff: Math.fround(operator.falloff),
      targetHeight: Math.fround(operator.targetHeight),
      strength: Math.fround(operator.strength)
    });
  } else if (!isPositiveFinite(operator.sampleRadius)) {
    throw new RangeError("Prompt-noise Smooth sample radius is invalid");
  }
  return freezeOperator({
    ...operator,
    anchor,
    forward,
    radius: Math.fround(operator.radius),
    falloff: Math.fround(operator.falloff),
    sampleRadius: Math.fround(operator.sampleRadius),
    strength: Math.fround(operator.strength)
  });
}

function normalizeRiverControlPointState(operator: PromptNoiseRiverOperatorV1): Readonly<{
  curveMode: PromptNoiseRiverCurveMode;
  controlPoints: readonly PromptNoiseRiverControlPointV1[];
  nextControlPointId: number;
}> {
  const curveMode = operator.curveMode;
  const points = operator.controlPoints;
  if (!curveMode || !["linear", "catmull-rom", "bezier"].includes(curveMode)) {
    throw new RangeError("Prompt-noise River curve mode is invalid");
  }
  if (!points || points.length < RIVER_LIMITS.minPointCount) {
    throw new RangeError("Prompt-noise River control point count is invalid");
  }
  const ids = new Set<number>();
  const controlPoints = points.map((point, index) => {
    if (
      !Number.isInteger(point.id) ||
      point.id < 1 ||
      point.id > MAX_EXACT_FLOAT_INTEGER ||
      ids.has(point.id) ||
      !Number.isFinite(point.bedHeight) ||
      !Number.isFinite(point.width) ||
      point.width < RIVER_LIMITS.minWidth ||
      point.width > RIVER_LIMITS.maxWidth ||
      !Number.isFinite(point.depth) ||
      point.depth < RIVER_LIMITS.minDepth ||
      point.depth > RIVER_LIMITS.maxDepth ||
      !Number.isFinite(point.flowSpeed) ||
      point.flowSpeed < RIVER_LIMITS.minFlowSpeed ||
      point.flowSpeed > RIVER_LIMITS.maxFlowSpeed ||
      !Number.isFinite(point.bankFeather) ||
      point.bankFeather < RIVER_LIMITS.minBankFeather ||
      point.bankFeather > RIVER_LIMITS.maxBankFeather
    ) {
      throw new RangeError(`Prompt-noise River control point ${index} is invalid`);
    }
    ids.add(point.id);
    return {
      id: point.id,
      position: freezePoint(point.position),
      bedHeight: Math.fround(point.bedHeight),
      width: Math.fround(point.width),
      depth: Math.fround(point.depth),
      flowSpeed: Math.fround(point.flowSpeed),
      bankFeather: Math.fround(point.bankFeather),
      inHandle: freezePoint(point.inHandle),
      outHandle: freezePoint(point.outHandle)
    };
  });
  if (
    !Number.isInteger(operator.nextControlPointId) ||
    operator.nextControlPointId! < 1 ||
    operator.nextControlPointId! > MAX_EXACT_FLOAT_INTEGER ||
    controlPoints.some((point) => point.id >= operator.nextControlPointId!)
  ) {
    throw new RangeError("Prompt-noise next River control point id is invalid");
  }
  return deepFreeze({ curveMode, controlPoints, nextControlPointId: operator.nextControlPointId! });
}

function normalizeRiverReachTopology(
  topology: PromptNoiseRiverReachTopologyV1 | undefined
): PromptNoiseRiverReachTopologyV1 | undefined {
  if (!topology) return undefined;
  if (
    ![topology.networkId, topology.fromNodeId, topology.toNodeId].every(
      (value) => Number.isInteger(value) && value > 0 && value <= MAX_EXACT_FLOAT_INTEGER
    ) ||
    topology.fromNodeId === topology.toNodeId ||
    !isNonNegativeFinite(topology.fromMergeRadius) ||
    !isNonNegativeFinite(topology.toMergeRadius)
  ) {
    throw new RangeError("Prompt-noise River Reach topology is invalid");
  }
  return deepFreeze({
    networkId: topology.networkId,
    fromNodeId: topology.fromNodeId,
    toNodeId: topology.toNodeId,
    fromMergeRadius: Math.fround(topology.fromMergeRadius),
    toMergeRadius: Math.fround(topology.toMergeRadius)
  });
}

function validatePlacementParameters(value: PromptNoisePlacementParametersV1): PromptNoisePlacementParametersV1 {
  const numericValues = Object.values(value);
  if (numericValues.some((entry) => !Number.isFinite(entry)) || !isUnitInterval(value.strength)) {
    throw new RangeError("Prompt-noise placement parameters are invalid");
  }
  if (
    value.length <= 0 ||
    value.halfWidth <= 0 ||
    value.bankWidth <= 0 ||
    value.cutDepth < 0 ||
    value.minimumDrop < 0 ||
    value.bankHeight < 0 ||
    value.sourceWidth < RIVER_LIMITS.minWidth ||
    value.sourceWidth > RIVER_LIMITS.maxWidth ||
    value.middleWidth < RIVER_LIMITS.minWidth ||
    value.middleWidth > RIVER_LIMITS.maxWidth ||
    value.mouthWidth < RIVER_LIMITS.minWidth ||
    value.mouthWidth > RIVER_LIMITS.maxWidth ||
    value.sourceDepth < RIVER_LIMITS.minDepth ||
    value.sourceDepth > RIVER_LIMITS.maxDepth ||
    value.middleDepth < RIVER_LIMITS.minDepth ||
    value.middleDepth > RIVER_LIMITS.maxDepth ||
    value.mouthDepth < RIVER_LIMITS.minDepth ||
    value.mouthDepth > RIVER_LIMITS.maxDepth ||
    value.sourceFlowSpeed < RIVER_LIMITS.minFlowSpeed ||
    value.sourceFlowSpeed > RIVER_LIMITS.maxFlowSpeed ||
    value.middleFlowSpeed < RIVER_LIMITS.minFlowSpeed ||
    value.middleFlowSpeed > RIVER_LIMITS.maxFlowSpeed ||
    value.mouthFlowSpeed < RIVER_LIMITS.minFlowSpeed ||
    value.mouthFlowSpeed > RIVER_LIMITS.maxFlowSpeed ||
    value.sourceBankFeather < RIVER_LIMITS.minBankFeather ||
    value.sourceBankFeather > RIVER_LIMITS.maxBankFeather ||
    value.middleBankFeather < RIVER_LIMITS.minBankFeather ||
    value.middleBankFeather > RIVER_LIMITS.maxBankFeather ||
    value.mouthBankFeather < RIVER_LIMITS.minBankFeather ||
    value.mouthBankFeather > RIVER_LIMITS.maxBankFeather ||
    value.radius <= 0 ||
    value.falloff <= 0 ||
    value.falloff > value.radius ||
    value.sampleRadius <= 0
  )
    throw new RangeError("Prompt-noise placement parameter ranges are invalid");
  return value;
}

function placementParameters(override: Partial<PromptNoisePlacementParametersV1>): PromptNoisePlacementParametersV1 {
  return Object.freeze({
    length: 720,
    bend: 0,
    halfWidth: 24,
    bankWidth: 120,
    cutDepth: 10,
    minimumDrop: 12,
    bankHeight: 36,
    sourceWidth: 5.4,
    sourceDepth: 1.05,
    sourceFlowSpeed: 2.45,
    sourceBankFeather: 1.1,
    middleWidth: 8,
    middleDepth: 1.7,
    middleFlowSpeed: 1.5,
    middleBankFeather: 2.2,
    mouthWidth: 11,
    mouthDepth: 2.3,
    mouthFlowSpeed: 0.92,
    mouthBankFeather: 3,
    radius: 180,
    falloff: 72,
    heightOffset: 0,
    sampleRadius: 28,
    strength: 0.8,
    ...override
  });
}

function freezeOperator<T extends PromptNoiseTerrainOperatorV1>(operator: T): T {
  return deepFreeze({
    ...operator,
    anchor: freezePoint(operator.anchor),
    forward: normalizeDirection(operator.forward)
  }) as T;
}

function freezePoint(point: PromptNoiseWorldPointV1): PromptNoiseWorldPointV1 {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.z))
    throw new RangeError("Prompt-noise world point is invalid");
  return Object.freeze({ x: Math.fround(point.x), z: Math.fround(point.z) });
}

function normalizeDirection(direction: PromptNoiseWorldPointV1): PromptNoiseWorldPointV1 {
  if (!Number.isFinite(direction.x) || !Number.isFinite(direction.z))
    throw new RangeError("Prompt-noise direction is invalid");
  const length = Math.hypot(direction.x, direction.z);
  if (length <= 1e-6) return Object.freeze({ x: 1, z: 0 });
  return Object.freeze({ x: Math.fround(direction.x / length), z: Math.fround(direction.z / length) });
}

function stageOf(operator: PromptNoiseTerrainOperatorV1): "shape" | "smooth" {
  return operator.kind === "smooth" ? "smooth" : "shape";
}

function assertTemplateKind(templateId: PromptNoiseOperatorTemplateId, kind: PromptNoiseTerrainOperatorKind): void {
  if (!PROMPT_NOISE_OPERATOR_TEMPLATES[templateId] || !templateId.startsWith(`${kind}-`)) {
    throw new RangeError(`Prompt-noise template ${JSON.stringify(templateId)} is incompatible with ${kind}`);
  }
}

function kindCode(kind: PromptNoiseTerrainOperatorKind): number {
  return kind === "river" ? 1 : kind === "flatten" ? 2 : 3;
}

function codeKind(code: number): PromptNoiseTerrainOperatorKind {
  if (code === 1) return "river";
  if (code === 2) return "flatten";
  if (code === 3) return "smooth";
  throw new RangeError(`Unknown prompt-noise operator kind code ${code}`);
}

function curveModeCode(mode: PromptNoiseRiverCurveMode): number {
  return mode === "linear" ? 1 : mode === "catmull-rom" ? 2 : 3;
}

function codeCurveMode(code: number): PromptNoiseRiverCurveMode {
  if (code === 1) return "linear";
  if (code === 2) return "catmull-rom";
  if (code === 3) return "bezier";
  throw new RangeError(`Unknown Prompt Noise River curve mode code ${code}`);
}

const TEMPLATE_CODES: Readonly<Record<PromptNoiseOperatorTemplateId, number>> = Object.freeze({
  "river-shallow": 101,
  "river-wide": 102,
  "river-canyon": 103,
  "flatten-camp": 201,
  "flatten-plateau": 202,
  "flatten-plain": 203,
  "smooth-light": 301,
  "smooth-strong": 302,
  "smooth-large": 303
});

function templateCode(templateId: PromptNoiseOperatorTemplateId): number {
  return TEMPLATE_CODES[templateId];
}

function codeTemplate(code: number): PromptNoiseOperatorTemplateId {
  const entry = Object.entries(TEMPLATE_CODES).find(([, candidate]) => candidate === code);
  if (!entry) throw new RangeError(`Unknown prompt-noise operator template code ${code}`);
  return entry[0] as PromptNoiseOperatorTemplateId;
}

function float32ToLittleEndianBytes(values: Float32Array): Uint8Array {
  const bytes = new Uint8Array(values.length * FLOAT32_BYTES);
  const view = new DataView(bytes.buffer);
  values.forEach((value, index) => view.setFloat32(index * FLOAT32_BYTES, value, true));
  return bytes;
}

function littleEndianBytesToFloat32(bytes: Uint8Array): Float32Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return Float32Array.from({ length: bytes.byteLength / FLOAT32_BYTES }, (_, index) =>
    view.getFloat32(index * FLOAT32_BYTES, true)
  );
}

function low16(value: number): number {
  return value & 0xffff;
}

function high16(value: number): number {
  return (value >>> 16) & 0xffff;
}

function join16(low: number, high: number): number {
  return ((exactInteger(high, "uint high word") << 16) | exactInteger(low, "uint low word")) >>> 0;
}

function exactInteger(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 0 || value > MAX_EXACT_FLOAT_INTEGER) {
    throw new RangeError(`Prompt-noise ${label} is invalid`);
  }
  return value;
}

function validateBounds(bounds: PromptNoiseOperatorBoundsV1): void {
  if (
    ![bounds.minX, bounds.minZ, bounds.maxX, bounds.maxZ].every(Number.isFinite) ||
    bounds.minX > bounds.maxX ||
    bounds.minZ > bounds.maxZ
  ) {
    throw new RangeError("Prompt-noise operator query bounds are invalid");
  }
}

function intersects(left: PromptNoiseOperatorBoundsV1, right: PromptNoiseOperatorBoundsV1): boolean {
  return left.minX <= right.maxX && left.maxX >= right.minX && left.minZ <= right.maxZ && left.maxZ >= right.minZ;
}

function isPositiveFinite(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function isNonNegativeFinite(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

function isUnitInterval(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

function isUint32(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= 0xffff_ffff;
}

function fract(value: number): number {
  return value - Math.floor(value);
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function mix(left: number, right: number, factor: number): number {
  return left + (right - left) * factor;
}

function midpoint(left: PromptNoiseWorldPointV1, right: PromptNoiseWorldPointV1): PromptNoiseWorldPointV1 {
  return { x: mix(left.x, right.x, 0.5), z: mix(left.z, right.z, 0.5) };
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  if (edge0 === edge1) return value < edge0 ? 0 : 1;
  const factor = clamp01((value - edge0) / (edge1 - edge0));
  return factor * factor * (3 - 2 * factor);
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}
