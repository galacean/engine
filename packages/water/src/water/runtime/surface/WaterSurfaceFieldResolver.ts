import {
  WATER_FIELD_DERIVED_INPUTS,
  findWaterFieldDependencyCycle
} from "../../authoring/surface/WaterSurfaceFieldDerivation";
/** Runtime provider selection and explicit fallback readback for Water Surface V2 fields. */
import {
  WaterFieldFallback,
  WaterFieldConsumerActivation,
  WaterFieldProviderKind,
  WaterFieldRequirement,
  WaterFieldSemantic,
  type WaterSurfaceFieldDependencyV2
} from "../../authoring/surface/WaterSurfaceFieldTypes";
import type { WaterQualityPlanV2 } from "../../authoring/quality/WaterQualityPlan";
import { WaterQualityTier } from "../../authoring/wave/enums/WaterQualityTier";
import type { CompiledWaterSurfaceFieldGraphV2 } from "../../compiler/surface/CompiledWaterSurfaceFieldTypes";

export type WaterSurfaceFieldResolutionStatus = "resolved" | "disabled" | "failed";

export interface WaterSurfaceFieldProviderAvailability {
  readonly quality: WaterQualityTier;
  /** Required runtime provider budget owned by the active Water Quality Plan. */
  readonly effectiveQualityPlan: Pick<WaterQualityPlanV2, "id" | "sceneFields">;
  readonly compiledSpatialFields: ReadonlySet<WaterFieldSemantic>;
  readonly enabledActivations: ReadonlySet<WaterFieldConsumerActivation>;
  readonly cameraDepth: boolean;
  readonly cameraOpaqueColor: boolean;
}

export interface WaterSurfaceFieldBindingReadback {
  readonly consumerId: string;
  readonly semantic: WaterFieldSemantic;
  readonly unit: WaterSurfaceFieldDependencyV2["unit"];
  readonly requirement: WaterFieldRequirement;
  readonly requestedProviders: readonly WaterFieldProviderKind[];
  readonly activation: WaterFieldConsumerActivation;
  readonly resolvedProvider?: WaterFieldProviderKind;
  readonly fallback: WaterFieldFallback;
  readonly fallbackApplied: boolean;
  /** True when an unavailable optional consumer resolves to its neutral disabled state. */
  readonly neutralApplied?: boolean;
  readonly status: WaterSurfaceFieldResolutionStatus;
  readonly reason?:
    | "quality-plan-provider-disabled"
    | "consumer-disabled"
    | "provider-unavailable"
    | "derived-input-unavailable"
    | "derived-input-disabled"
    | "derived-dependency-cycle";
  readonly missingInputs?: readonly WaterFieldSemantic[];
}

export interface WaterSurfaceFieldEffectiveQualityReadback {
  readonly source: "water-quality-plan";
  readonly planId: string;
  readonly allowedProviders: readonly WaterFieldProviderKind[];
}

export interface WaterSurfaceFieldGraphReadback {
  readonly sourceId: string;
  readonly contentHash: string;
  readonly variantKey: string;
  readonly quality: WaterQualityTier;
  readonly effectiveQuality?: WaterSurfaceFieldEffectiveQualityReadback;
  readonly active: boolean;
  readonly failed: boolean;
  readonly cameraDepthRequested: boolean;
  readonly cameraOpaqueColorRequested: boolean;
  readonly bindings: readonly WaterSurfaceFieldBindingReadback[];
}

function resolveEffectiveQuality(
  graph: CompiledWaterSurfaceFieldGraphV2,
  availability: WaterSurfaceFieldProviderAvailability
): WaterSurfaceFieldEffectiveQualityReadback {
  const plan = availability.effectiveQualityPlan;
  const allowedProviders = Object.values(WaterFieldProviderKind).filter((provider) => {
    if (provider === WaterFieldProviderKind.CameraDepth) return plan.sceneFields === "scene-color-depth";
    if (provider === WaterFieldProviderKind.CameraOpaqueColor) return plan.sceneFields !== "local-only";
    return true;
  });
  return Object.freeze({
    source: "water-quality-plan" as const,
    planId: plan.id,
    allowedProviders: Object.freeze(allowedProviders)
  });
}

function providerAllowedByQualityPlan(
  provider: WaterFieldProviderKind,
  effectiveQuality: WaterSurfaceFieldEffectiveQualityReadback
): boolean {
  return effectiveQuality.allowedProviders.includes(provider);
}

function providerAvailable(
  provider: WaterFieldProviderKind,
  binding: WaterSurfaceFieldDependencyV2,
  availability: WaterSurfaceFieldProviderAvailability,
  resolvedSemantics: ReadonlySet<WaterFieldSemantic>
): boolean {
  switch (provider) {
    case WaterFieldProviderKind.CompiledSpatialField:
      return availability.compiledSpatialFields.has(binding.semantic);
    case WaterFieldProviderKind.CameraDepth:
      return availability.cameraDepth;
    case WaterFieldProviderKind.CameraOpaqueColor:
      return availability.cameraOpaqueColor;
    case WaterFieldProviderKind.Constant:
      return true;
    case WaterFieldProviderKind.Derived:
      if (
        binding.semantic === WaterFieldSemantic.SurfaceNormalDepth &&
        availability.quality === WaterQualityTier.High
      ) {
        return false;
      }
      return (WATER_FIELD_DERIVED_INPUTS[binding.semantic] ?? []).some((input) => resolvedSemantics.has(input));
  }
}

function unresolvedReadback(
  binding: WaterSurfaceFieldDependencyV2,
  reason: NonNullable<WaterSurfaceFieldBindingReadback["reason"]>,
  missingInputs?: readonly WaterFieldSemantic[]
): WaterSurfaceFieldBindingReadback {
  const failed =
    binding.requirement === WaterFieldRequirement.Required || binding.fallback === WaterFieldFallback.FailActivation;
  return Object.freeze({
    consumerId: binding.consumerId,
    semantic: binding.semantic,
    unit: binding.unit,
    requirement: binding.requirement,
    requestedProviders: binding.providers,
    activation: binding.activation,
    fallback: binding.fallback,
    fallbackApplied: true,
    neutralApplied: !failed,
    status: failed ? "failed" : "disabled",
    reason,
    ...(missingInputs ? { missingInputs: Object.freeze(missingInputs) } : {})
  });
}

/** Resolves ordered providers without mutating or owning any renderer/scene resource. */
export function resolveWaterSurfaceFieldGraph(
  graph: CompiledWaterSurfaceFieldGraphV2,
  availability: WaterSurfaceFieldProviderAvailability
): WaterSurfaceFieldGraphReadback {
  const effectiveQuality = resolveEffectiveQuality(graph, availability);
  const resolvedSemantics = new Set<WaterFieldSemantic>();
  // Least fixed point: only concrete/previously established semantics can seed a derivation.
  // Evaluate each round against an immutable frontier so consumer naming cannot select providers.
  let changed = true;
  while (changed) {
    changed = false;
    const frontier = new Set(resolvedSemantics);
    for (const binding of graph.bindings) {
      if (!availability.enabledActivations.has(binding.activation)) continue;
      const candidates =
        binding.fallback === WaterFieldFallback.UseNextProvider ? binding.providers : binding.providers.slice(0, 1);
      if (
        candidates.some(
          (provider) =>
            providerAllowedByQualityPlan(provider, effectiveQuality) &&
            providerAvailable(provider, binding, availability, frontier)
        ) &&
        !resolvedSemantics.has(binding.semantic)
      ) {
        resolvedSemantics.add(binding.semantic);
        changed = true;
      }
    }
  }
  const readbacks = new Map<string, WaterSurfaceFieldBindingReadback>();
  const resolveBinding = (binding: WaterSurfaceFieldDependencyV2): void => {
    if (!availability.enabledActivations.has(binding.activation)) {
      readbacks.set(
        binding.consumerId,
        Object.freeze({
          consumerId: binding.consumerId,
          semantic: binding.semantic,
          unit: binding.unit,
          requirement: binding.requirement,
          requestedProviders: binding.providers,
          activation: binding.activation,
          fallback: binding.fallback,
          fallbackApplied: false,
          neutralApplied: false,
          status: "disabled" as const,
          reason: "consumer-disabled" as const
        })
      );
      return;
    }
    const candidateProviders =
      binding.fallback === WaterFieldFallback.UseNextProvider ? binding.providers : binding.providers.slice(0, 1);
    const qualityAllowedProviders = candidateProviders.filter((provider) =>
      providerAllowedByQualityPlan(provider, effectiveQuality)
    );
    const resolvedIndex = candidateProviders.findIndex(
      (provider) =>
        providerAllowedByQualityPlan(provider, effectiveQuality) &&
        providerAvailable(provider, binding, availability, resolvedSemantics)
    );
    if (resolvedIndex < 0) {
      const inputs = WATER_FIELD_DERIVED_INPUTS[binding.semantic] ?? [];
      const missingInputs = inputs.filter((input) => !resolvedSemantics.has(input));
      const disabledInput =
        missingInputs.length > 0 &&
        missingInputs.every(
          (input) =>
            graph.bindings.some((candidate) => candidate.semantic === input) &&
            graph.bindings
              .filter((candidate) => candidate.semantic === input)
              .every((candidate) => !availability.enabledActivations.has(candidate.activation))
        );
      const cycle = findWaterFieldDependencyCycle(binding.semantic, WATER_FIELD_DERIVED_INPUTS);
      readbacks.set(
        binding.consumerId,
        unresolvedReadback(
          binding,
          qualityAllowedProviders.length === 0
            ? "quality-plan-provider-disabled"
            : binding.providers.includes(WaterFieldProviderKind.Derived)
              ? cycle
                ? "derived-dependency-cycle"
                : disabledInput
                  ? "derived-input-disabled"
                  : "derived-input-unavailable"
              : "provider-unavailable",
          binding.providers.includes(WaterFieldProviderKind.Derived) ? missingInputs : undefined
        )
      );
      return;
    }
    const resolvedProvider = candidateProviders[resolvedIndex];
    resolvedSemantics.add(binding.semantic);
    readbacks.set(
      binding.consumerId,
      Object.freeze({
        consumerId: binding.consumerId,
        semantic: binding.semantic,
        unit: binding.unit,
        requirement: binding.requirement,
        requestedProviders: binding.providers,
        activation: binding.activation,
        resolvedProvider,
        fallback: binding.fallback,
        fallbackApplied: resolvedIndex > 0,
        neutralApplied: false,
        status: "resolved" as const
      })
    );
  };
  for (const binding of graph.bindings) resolveBinding(binding);
  const bindings = graph.bindings.map((binding) => readbacks.get(binding.consumerId)!);
  const failed = bindings.some((binding) => binding.status === "failed");
  const cameraDepthRequested = bindings.some(
    (binding) => binding.status === "resolved" && binding.resolvedProvider === WaterFieldProviderKind.CameraDepth
  );
  const cameraOpaqueColorRequested = bindings.some(
    (binding) => binding.status === "resolved" && binding.resolvedProvider === WaterFieldProviderKind.CameraOpaqueColor
  );
  return Object.freeze({
    sourceId: graph.sourceId,
    contentHash: graph.contentHash,
    variantKey: graph.variantKey,
    quality: availability.quality,
    effectiveQuality,
    active: !failed && bindings.some((binding) => binding.status === "resolved"),
    failed,
    cameraDepthRequested,
    cameraOpaqueColorRequested,
    bindings: Object.freeze(bindings)
  });
}

export class WaterSurfaceFieldActivationError extends Error {
  constructor(readonly readback: WaterSurfaceFieldGraphReadback) {
    const failedConsumers = readback.bindings
      .filter((binding) => binding.status === "failed")
      .map((binding) => binding.consumerId)
      .join(", ");
    super(`Water Surface field activation failed for: ${failedConsumers}.`);
    this.name = "WaterSurfaceFieldActivationError";
  }
}
