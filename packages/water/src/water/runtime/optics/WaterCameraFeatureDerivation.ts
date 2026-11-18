/** Deterministic camera request derivation from resolved WaterBody semantics. */
import { Downsampling } from "@galacean/engine-core";
import { WaterFieldConsumerActivation, WaterFieldSemantic } from "../../authoring/surface/WaterSurfaceFieldTypes";
import type { WaterReflectionMode } from "../../authoring/body/WaterBodyAuthoringTypes";
import type { ResolvedWaterBodyInstance } from "../../authoring/body/ResolvedWaterBodyInstance";
import {
  resolveEffectiveWaterCausticsEnabled,
  resolveWaterOpaqueDownsampling,
  resolveWaterReflectionPolicyForQuality
} from "../../authoring/quality/WaterQualityPlan";
import type { WaterCameraFeatureQuality, WaterCameraFeatureRequest } from "./CameraWaterFeatureBroker";
import { resolveWaterBodyQualityTier } from "../body/WaterBodyRuntimeSemantics";
import {
  resolveWaterSurfaceFieldGraph,
  WaterSurfaceFieldActivationError,
  type WaterSurfaceFieldGraphReadback
} from "../surface/WaterSurfaceFieldResolver";

export interface WaterCameraFeatureDerivationOptions {
  /** False for offline/no-camera activation so optional V2 providers can resolve their explicit fallback. */
  readonly cameraProvidersAvailable?: boolean;
  /** Runtime presentation override owned by the shared reflection lifecycle. */
  readonly reflectionMode?: WaterReflectionMode;
  /** Actual backend receiver capability. SSR Camera ownership is fail-closed unless true. */
  readonly ssrEligible?: boolean;
}

export interface WaterCameraFeatureDerivationResult {
  readonly request?: WaterCameraFeatureRequest;
  readonly fieldGraph?: WaterSurfaceFieldGraphReadback;
}

export type WaterCameraFeatureResolvedInstance = ResolvedWaterBodyInstance;

function resolveQuality(resolved: WaterCameraFeatureResolvedInstance): WaterCameraFeatureQuality {
  switch (resolved.qualityPlan.surfaceShading) {
    case "low":
      return "low";
    case "medium":
      return "medium";
    case "high":
      return "high";
  }
  throw new Error("Unsupported Water quality tier.");
}

function resolveOpaqueDownsampling(resolved: WaterCameraFeatureResolvedInstance): Downsampling {
  switch (resolveWaterOpaqueDownsampling(resolved.qualityPlan)) {
    case "none":
      return Downsampling.None;
    case "2x":
      return Downsampling.TwoX;
    case "4x":
      return Downsampling.FourX;
  }
}

function resolveReflection(resolved: WaterCameraFeatureResolvedInstance): WaterReflectionMode {
  const policy = resolveWaterReflectionPolicyForQuality(
    resolved.renderContract.reflectionIntent.policy,
    resolved.qualityPlan.reflectionBudget
  );
  switch (policy.preferred) {
    case "analytic":
      return "none";
    case "environment":
      return "probe";
    case "ssr":
      return "ssr";
  }
}

function enabledFieldConsumerActivations(
  resolved: WaterCameraFeatureResolvedInstance,
  refractionEnabled: boolean,
  reflection: WaterReflectionMode
): ReadonlySet<WaterFieldConsumerActivation> {
  const activations = new Set<WaterFieldConsumerActivation>([WaterFieldConsumerActivation.Always]);
  const appearanceV2 = resolved.renderContract.surfaceClosure.appearance;
  const features = resolved.appearance.featureFlags;
  if (refractionEnabled) activations.add(WaterFieldConsumerActivation.RefractionEnabled);
  if (appearanceV2 || features.depthTint) activations.add(WaterFieldConsumerActivation.DepthTintEnabled);
  if (appearanceV2?.boundaryEffects.some(({ outputs }) => outputs.alpha !== undefined) || features.coastalAlpha) {
    activations.add(WaterFieldConsumerActivation.CoastalAlphaEnabled);
  }
  if (
    appearanceV2?.boundaryEffects.some(
      ({ field, pattern }) => field === WaterFieldSemantic.ObstacleContact || pattern !== undefined
    ) ||
    features.contactFoam
  ) {
    activations.add(WaterFieldConsumerActivation.ContactFoamEnabled);
  }
  if (reflection !== "none") activations.add(WaterFieldConsumerActivation.ReflectionEnabled);
  if (resolveEffectiveWaterCausticsEnabled(resolved.optics.caustics, resolved.qualityPlan)) {
    activations.add(WaterFieldConsumerActivation.CausticsEnabled);
  }
  return activations;
}

/** SceneDepth is requested only by an explicit SceneDepth/Hybrid consumer. LocalBathymetry never creates Depth. */
function compiledSpatialFieldSemantics(resolved: WaterCameraFeatureResolvedInstance): ReadonlySet<WaterFieldSemantic> {
  const semantics = new Set<WaterFieldSemantic>([WaterFieldSemantic.Coverage, WaterFieldSemantic.SurfaceHeight]);
  const capabilities = resolved.asset.source.capabilities;
  if (capabilities.localBathymetry) semantics.add(WaterFieldSemantic.VerticalDepth);
  if (capabilities.shoreSdf) semantics.add(WaterFieldSemantic.HorizontalShoreDistance);
  if (capabilities.current) semantics.add(WaterFieldSemantic.Flow);
  return semantics;
}

export function deriveWaterCameraFeatureResolution(
  resolved: WaterCameraFeatureResolvedInstance,
  options: WaterCameraFeatureDerivationOptions = {}
): WaterCameraFeatureDerivationResult {
  const refractionEnabled =
    resolved.optics.refractionEnabled && resolved.renderContract.surfaceClosure.appearance.refraction.enabled;
  const reflection = options.reflectionMode ?? resolveReflection(resolved);
  const cameraReflection = reflection === "ssr" && options.ssrEligible !== true ? "none" : reflection;
  let fieldGraph: WaterSurfaceFieldGraphReadback | undefined;
  const cameraProvidersAvailable = options.cameraProvidersAvailable !== false;
  const sceneFields = resolved.qualityPlan.sceneFields;
  fieldGraph = resolveWaterSurfaceFieldGraph(resolved.renderContract.surfaceClosure.fields, {
    quality: resolveWaterBodyQualityTier(resolved.qualityPlan.surfaceShading),
    effectiveQualityPlan: resolved.qualityPlan,
    compiledSpatialFields: compiledSpatialFieldSemantics(resolved),
    enabledActivations: enabledFieldConsumerActivations(resolved, refractionEnabled, reflection),
    cameraDepth: cameraProvidersAvailable && sceneFields === "scene-color-depth",
    cameraOpaqueColor: cameraProvidersAvailable && sceneFields !== "local-only"
  });
  if (fieldGraph.failed) throw new WaterSurfaceFieldActivationError(fieldGraph);
  const depthTexture = fieldGraph.cameraDepthRequested;
  const opaqueTexture = fieldGraph.cameraOpaqueColorRequested;
  const caustics = resolveEffectiveWaterCausticsEnabled(resolved.optics.caustics, resolved.qualityPlan);
  // Environment ownership stays in WaterReflectionService. SSR instead acquires
  // the engine Camera's shared consumer lease through this broker.
  const requiresLease = depthTexture || opaqueTexture || cameraReflection === "ssr";
  if (!requiresLease) return Object.freeze({ fieldGraph });
  const request: WaterCameraFeatureRequest = Object.freeze({
    depthTexture,
    opaqueTexture,
    reflection: cameraReflection,
    caustics,
    quality: resolveQuality(resolved),
    opaqueDownsampling: resolveOpaqueDownsampling(resolved),
    fieldGraph
  });
  return Object.freeze({ request, fieldGraph });
}

export function deriveWaterCameraFeatureRequest(
  resolved: WaterCameraFeatureResolvedInstance,
  options: WaterCameraFeatureDerivationOptions = {}
): WaterCameraFeatureRequest | undefined {
  return deriveWaterCameraFeatureResolution(resolved, options).request;
}
