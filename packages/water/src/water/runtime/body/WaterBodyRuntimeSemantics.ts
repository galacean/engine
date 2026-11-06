/** Pure semantic readbacks derived from the authoritative Water bundle. */
import type {
  WaterBodyCapabilityRequirementsV1,
  WaterOpaqueDownsampling,
  WaterSpatialFieldQualityBudgetV1
} from "../../authoring/body/WaterBodyAuthoringTypes";
import type { ResolvedWaterBodyInstance } from "../../authoring/body/ResolvedWaterBodyInstance";
import { resolveWaterOpaqueDownsampling } from "../../authoring/quality/WaterQualityPlan";
import {
  WaterFieldFallback,
  WaterFieldProviderKind,
  WaterFieldRequirement,
  WaterFieldSemantic
} from "../../authoring/surface/WaterSurfaceFieldTypes";
import { WaterQualityTier } from "../../authoring/wave/enums/WaterQualityTier";

export function resolveWaterBodyQualityTier(
  level: ResolvedWaterBodyInstance["qualityPlan"]["surfaceShading"]
): WaterQualityTier {
  switch (level) {
    case "low":
      return WaterQualityTier.Low;
    case "medium":
      return WaterQualityTier.Medium;
    case "high":
      return WaterQualityTier.High;
  }
}

export interface WaterResolvedQualityReadback {
  readonly planId: string;
  readonly tier: WaterQualityTier;
  readonly opaqueDownsampling: WaterOpaqueDownsampling;
  readonly spatialField: WaterSpatialFieldQualityBudgetV1;
}

/** Compact diagnostic projection of the authoritative Quality Plan. */
export function createWaterResolvedQualityReadback(
  resolved: Readonly<ResolvedWaterBodyInstance>
): Readonly<WaterResolvedQualityReadback> {
  const tier = resolveWaterBodyQualityTier(resolved.qualityPlan.surfaceShading);
  return Object.freeze({
    planId: resolved.qualityPlan.id,
    tier,
    opaqueDownsampling: resolveWaterOpaqueDownsampling(resolved.qualityPlan),
    spatialField: resolved.qualityPlan.spatialField
  });
}

export function resolveWaterBodyCapabilityRequirements(
  resolved: Readonly<ResolvedWaterBodyInstance>
): Readonly<WaterBodyCapabilityRequirementsV1> {
  // Explicit query-off Ocean plans do not require CPU field channels.
  // Query-enabled Ocean publishes its existing bed/shore atlas through the
  // Surface and SpatialField ports; query-off Lakes retain their field contract.
  if (resolved.asset.kind === "ocean" && resolved.qualityPlan.query === "off") {
    return Object.freeze({ localBathymetry: "disabled", shoreSdf: "disabled", current: "disabled" });
  }
  const requirement = (semantic: WaterFieldSemantic): "required" | "optional" | "disabled" => {
    const consumers = resolved.renderContract.surfaceClosure.fields.bindings.filter(
      (binding) =>
        binding.semantic === semantic && binding.providers.includes(WaterFieldProviderKind.CompiledSpatialField)
    );
    if (consumers.length === 0) return "disabled";
    return consumers.some(
      (binding) =>
        binding.requirement === WaterFieldRequirement.Required &&
        (binding.fallback !== WaterFieldFallback.UseNextProvider ||
          binding.providers.every((provider) => provider === WaterFieldProviderKind.CompiledSpatialField))
    )
      ? "required"
      : "optional";
  };
  const preserveQueryCapability = (
    renderRequirement: "required" | "optional" | "disabled",
    available: boolean
  ): "required" | "optional" | "disabled" =>
    renderRequirement !== "disabled"
      ? renderRequirement
      : resolved.qualityPlan.query !== "off" && available
        ? "optional"
        : "disabled";
  return Object.freeze({
    localBathymetry: preserveQueryCapability(
      requirement(WaterFieldSemantic.VerticalDepth),
      resolved.asset.source.capabilities.localBathymetry
    ),
    shoreSdf: preserveQueryCapability(
      requirement(WaterFieldSemantic.HorizontalShoreDistance),
      resolved.asset.source.capabilities.shoreSdf
    ),
    current: preserveQueryCapability(requirement(WaterFieldSemantic.Flow), resolved.asset.source.capabilities.current)
  });
}
