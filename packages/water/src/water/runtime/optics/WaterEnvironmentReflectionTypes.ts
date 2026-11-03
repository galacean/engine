import type { TextureCube } from "@galacean/engine-core";

export type WaterEnvironmentReflectionColorSpace = "linear" | "srgb";
export type WaterEnvironmentReflectionVector3 = readonly [x: number, y: number, z: number];
/** Distant IBL and finite local captures never compete for the same semantic slot. */
export type WaterEnvironmentReflectionRole = "distant-environment" | "local-probe";

/**
 * Optional finite-volume correction for a scene-owned cubemap. Omission means
 * the cubemap is an infinitely distant environment map. The Water runtime only
 * borrows these values; the scene adapter remains responsible for capturing
 * the cubemap and defining the volume in the same world space as the surface.
 */
export interface WaterEnvironmentReflectionBoxProjection {
  readonly mode: "box";
  readonly probePosition: WaterEnvironmentReflectionVector3;
  readonly boxMinimum: WaterEnvironmentReflectionVector3;
  readonly boxMaximum: WaterEnvironmentReflectionVector3;
}

export type WaterEnvironmentReflectionProjection = WaterEnvironmentReflectionBoxProjection;

/** One scene-owned cubemap lobe. Water never owns or destroys `texture`. */
export interface WaterEnvironmentReflectionLobe {
  readonly texture: TextureCube;
  readonly ownership: "borrowed";
  /** World-space Y rotation matching SkyBoxMaterial, in degrees. */
  readonly rotationDegrees: number;
  /** Linear radiance multiplier authored by the scene sky. */
  readonly exposure: number;
  /** Dynamic scene environment/specular intensity. */
  readonly intensity: number;
  readonly colorSpace: WaterEnvironmentReflectionColorSpace;
  readonly hdr: boolean;
  readonly maximumMipLevel: number;
  /** Local probes opt into parallax correction; sky IBL leaves this absent. */
  readonly projection?: Readonly<WaterEnvironmentReflectionProjection>;
}

/**
 * One immutable scene-published environment frame. The scene owns the
 * textures and revision; Water only samples the current frame.
 */
export interface WaterEnvironmentReflectionFrame {
  readonly providerId: string;
  readonly role: WaterEnvironmentReflectionRole;
  readonly revision: number;
  readonly primary: Readonly<WaterEnvironmentReflectionLobe>;
  readonly secondary?: Readonly<WaterEnvironmentReflectionLobe>;
  readonly secondaryWeight: number;
}

/** Backward-compatible single-lobe binding used by scene probe adapters. */
export interface WaterEnvironmentReflectionBinding extends WaterEnvironmentReflectionLobe {
  readonly providerId: string;
  /** Legacy single-lobe adapters may omit this; the service normalizes it once at the boundary. */
  readonly role?: WaterEnvironmentReflectionRole;
}

export interface WaterEnvironmentReflectionProviderRequest {
  readonly id: string;
  /** Legacy requests are normalized from projection semantics; new providers always publish this explicitly. */
  readonly role?: WaterEnvironmentReflectionRole;
  readonly priority: number;
  readonly active: boolean;
  readonly binding?: Readonly<WaterEnvironmentReflectionBinding>;
  readonly frame?: Readonly<WaterEnvironmentReflectionFrame>;
}

export function isValidWaterEnvironmentReflectionLobe(value: unknown): value is WaterEnvironmentReflectionLobe {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<WaterEnvironmentReflectionLobe>;
  return (
    !!candidate.texture &&
    candidate.ownership === "borrowed" &&
    typeof candidate.rotationDegrees === "number" &&
    Number.isFinite(candidate.rotationDegrees) &&
    typeof candidate.exposure === "number" &&
    Number.isFinite(candidate.exposure) &&
    candidate.exposure >= 0 &&
    typeof candidate.intensity === "number" &&
    Number.isFinite(candidate.intensity) &&
    candidate.intensity >= 0 &&
    (candidate.colorSpace === "linear" || candidate.colorSpace === "srgb") &&
    typeof candidate.hdr === "boolean" &&
    Number.isInteger(candidate.maximumMipLevel) &&
    (candidate.maximumMipLevel ?? -1) >= 0 &&
    (candidate.projection === undefined || isValidWaterEnvironmentReflectionProjection(candidate.projection))
  );
}

export function isValidWaterEnvironmentReflectionFrame(value: unknown): value is WaterEnvironmentReflectionFrame {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<WaterEnvironmentReflectionFrame>;
  return (
    typeof candidate.providerId === "string" &&
    candidate.providerId.trim().length > 0 &&
    (candidate.role === "distant-environment" || candidate.role === "local-probe") &&
    Number.isInteger(candidate.revision) &&
    (candidate.revision ?? -1) >= 0 &&
    isValidWaterEnvironmentReflectionLobe(candidate.primary) &&
    (candidate.secondary === undefined || isValidWaterEnvironmentReflectionLobe(candidate.secondary)) &&
    typeof candidate.secondaryWeight === "number" &&
    Number.isFinite(candidate.secondaryWeight) &&
    candidate.secondaryWeight >= 0 &&
    candidate.secondaryWeight <= 1 &&
    (candidate.secondary !== undefined || candidate.secondaryWeight === 0) &&
    (candidate.role !== "distant-environment" ||
      (candidate.primary.projection === undefined && candidate.secondary?.projection === undefined)) &&
    (candidate.role !== "local-probe" ||
      (candidate.primary.projection?.mode === "box" && candidate.secondary === undefined))
  );
}

function isFiniteVector3(value: unknown): value is WaterEnvironmentReflectionVector3 {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((component) => typeof component === "number" && Number.isFinite(component))
  );
}

/** Shared strict validation used by providers, the reflection service, and tests. */
export function isValidWaterEnvironmentReflectionProjection(
  projection: unknown
): projection is WaterEnvironmentReflectionProjection {
  if (!projection || typeof projection !== "object") return false;
  const candidate = projection as Partial<WaterEnvironmentReflectionBoxProjection>;
  if (
    candidate.mode !== "box" ||
    !isFiniteVector3(candidate.probePosition) ||
    !isFiniteVector3(candidate.boxMinimum) ||
    !isFiniteVector3(candidate.boxMaximum)
  ) {
    return false;
  }
  return (
    candidate.boxMinimum[0] < candidate.boxMaximum[0] &&
    candidate.boxMinimum[1] < candidate.boxMaximum[1] &&
    candidate.boxMinimum[2] < candidate.boxMaximum[2]
  );
}
