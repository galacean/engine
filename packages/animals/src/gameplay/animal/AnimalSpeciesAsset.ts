import type { JSONAsset } from "@galacean/engine";
import type { BehaviorNode } from "../behavior/BehaviorTree";
import type { AnimalDefinition } from "./Animal";
import type { GLBAnimalProfile } from "./GLBAnimalPresenter";

/** Animation roles used by grounded companions; source clip names belong to the asset binding. */
export type AnimalAnimationState =
  | "idle"
  | "idleB"
  | "idleC"
  | "eat"
  | "falling"
  | "launch"
  | "walk"
  | "run"
  | "walkLeft"
  | "walkRight"
  | "runLeft"
  | "runRight"
  | "stop"
  | "turn"
  | "death";

/** Asset calibration and grounded companion capabilities, in metres, radians and seconds. */
export interface AnimalCompanionProfile {
  readonly modelScale: number;
  readonly modelGroundOffset: number;
  readonly skinnedBounds: {
    readonly min: readonly [number, number, number];
    readonly max: readonly [number, number, number];
  };
  readonly rootMotion?: { readonly bone: string; readonly horizontalAxes: readonly ["x" | "y" | "z", "x" | "y" | "z"] };
  readonly saddleBone?: string;
  readonly saddleLocal?: readonly [number, number, number];
  readonly mountable: boolean;
  readonly spawnDistance: number;
  readonly skyHeight: number;
  readonly dropSeconds: number;
  readonly fallingSeconds: number;
  readonly skySideAngle: number;
  readonly skyFacingOffset: number;
  readonly fadeSeconds: number;
  readonly vanishSeconds: number;
  readonly walkSpeed: number;
  readonly walkClipSpeed: number;
  readonly gallopSpeed: number;
  readonly turnSpeed: number;
  readonly rideMaxTurnRate: number;
  readonly viewFollowGain: number;
  readonly turnTolerance: number;
  readonly turnStepSpeed: number;
  readonly turnStepRadius: number;
  readonly arrivalDistance: number;
  readonly mountRadius: number;
  readonly mountExitRadius: number;
  readonly mountCooldown: number;
  readonly dismountDistance: number;
  readonly clips: Readonly<Partial<Record<AnimalAnimationState, string>> & { idle: string; walk: string; run: string }>;
}

/** Three authored geometry levels; selection is separate from behavior and movement. */
export interface AnimalLodProfile {
  /** Fixed reference diameter in model metres, covering every wing pose. */
  readonly size: number;
  /** Decreasing fractions of viewport height: LOD0, LOD1, LOD2, then cull. */
  readonly screenRelativeTransitionHeights: readonly [number, number, number];
  /** Exact model child names; all three levels may be embedded in one GLB. */
  readonly roots: readonly [string, string, string];
}

/** Persisted species data consumed identically by Scene loading and runtime creation. */
export interface AnimalSpeciesDocument {
  readonly version: 1;
  readonly id: string;
  readonly modelUrl: string;
  readonly roaming?: { readonly definition: AnimalDefinition; readonly presentation: GLBAnimalProfile };
  readonly companion?: {
    readonly behavior: BehaviorNode;
    readonly profile: AnimalCompanionProfile;
    /** Optional presentation resources; omission means immediate reveal/removal. */
    readonly dissolve?: { readonly noiseUrl: string; readonly particleUrl: string };
  };
  readonly lod?: AnimalLodProfile;
}

/** Instance scale never mutates the borrowed shared species preset. */
export type AnimalScaledProfile = AnimalCompanionProfile & {
  readonly scale: number;
  readonly dismountDistance: number;
};

/**
 * Resolve independent instance dimensions from an immutable species profile.
 * @param source Asset calibration and companion settings.
 * @param scale Positive multiplier relative to the authored metre-sized animal.
 * @returns Detached settings, with spatial quantities scaled once.
 */
export function scaleAnimalProfile(source: AnimalCompanionProfile, scale = 1): AnimalScaledProfile {
  if (!Number.isFinite(scale) || scale <= 0) throw new RangeError("Animal scale must be finite and positive");
  return {
    ...source,
    scale,
    modelScale: source.modelScale * scale,
    modelGroundOffset: source.modelGroundOffset * scale,
    spawnDistance: source.spawnDistance * scale,
    skyHeight: source.skyHeight * scale,
    walkSpeed: source.walkSpeed * scale,
    walkClipSpeed: source.walkClipSpeed * scale,
    gallopSpeed: source.gallopSpeed * scale,
    turnStepSpeed: source.turnStepSpeed * scale,
    turnStepRadius: source.turnStepRadius * scale,
    arrivalDistance: source.arrivalDistance * scale,
    mountRadius: source.mountRadius * scale,
    mountExitRadius: source.mountExitRadius * scale,
    dismountDistance: source.dismountDistance * scale
  };
}

/**
 * Read a stock JSONAsset after Scene/resource resolution; malformed documents fail before instantiation.
 * @param asset Host-owned species resource, loaded through the standard JSON loader.
 * @returns The validated borrowed species document.
 */
export function readAnimalSpecies(asset: JSONAsset): AnimalSpeciesDocument {
  const value = asset.data as AnimalSpeciesDocument;
  if (
    !value ||
    value.version !== 1 ||
    typeof value.id !== "string" ||
    !value.id.trim() ||
    typeof value.modelUrl !== "string" ||
    !value.modelUrl.trim() ||
    (!value.roaming && !value.companion)
  ) {
    throw new Error("Invalid animal species document");
  }
  if (value.lod) {
    const { size, roots, screenRelativeTransitionHeights: heights } = value.lod;
    if (
      !Number.isFinite(size) ||
      size <= 0 ||
      roots.length !== 3 ||
      new Set(roots).size !== 3 ||
      roots.some((root) => typeof root !== "string" || !root.trim()) ||
      heights.length !== 3 ||
      heights.some(
        (height, i) => !Number.isFinite(height) || height <= 0 || height > 1 || (i > 0 && height >= heights[i - 1])
      )
    ) {
      throw new Error("Animal LOD requires three decreasing screen-relative levels");
    }
  }
  const profile = value.companion?.profile;
  if (profile) {
    for (const key of [
      "modelScale",
      "walkSpeed",
      "walkClipSpeed",
      "gallopSpeed",
      "dropSeconds",
      "fallingSeconds",
      "turnStepRadius"
    ] as const) {
      if (!Number.isFinite(profile[key]) || profile[key] <= 0) throw new Error(`Invalid animal profile ${key}`);
    }
    if (profile.mountable && (!profile.saddleBone || !profile.saddleLocal))
      throw new Error("Rideable animal requires a seat binding");
    if (!profile.clips.idle || !profile.clips.walk || !profile.clips.run)
      throw new Error("Animal requires idle, walk and run clip bindings");
  }
  return value;
}
