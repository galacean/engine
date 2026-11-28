/** Deterministic minimum update class derived from two immutable effective snapshots. */
import type { EffectiveWaterRuntimeSnapshot } from "./EffectiveWaterRuntimeSnapshot";

export type WaterRuntimeUpdateKind =
  | "none"
  | "uniform-only"
  | "resource-binding"
  | "shader-variant"
  | "physical-resource"
  | "backend-replacement";

export interface WaterRuntimeUpdatePlan {
  readonly kind: WaterRuntimeUpdateKind;
  readonly changedPaths: readonly string[];
}

function same(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function planWaterRuntimeUpdate(
  previous: Readonly<EffectiveWaterRuntimeSnapshot>,
  next: Readonly<EffectiveWaterRuntimeSnapshot>
): Readonly<WaterRuntimeUpdatePlan> {
  if (previous.instanceId !== next.instanceId || previous.assetId !== next.assetId) {
    return Object.freeze({ kind: "backend-replacement", changedPaths: Object.freeze(["instance-or-asset"]) });
  }
  if (previous.physicalSurfaceHash !== next.physicalSurfaceHash) {
    return Object.freeze({ kind: "physical-resource", changedPaths: Object.freeze(["physicalSurfaceHash"]) });
  }
  if (previous.compiledResourceHash !== next.compiledResourceHash) {
    return Object.freeze({ kind: "resource-binding", changedPaths: Object.freeze(["compiledResourceHash"]) });
  }
  if (
    previous.renderResourceHash !== next.renderResourceHash ||
    previous.reflectionPolicyHash !== next.reflectionPolicyHash
  ) {
    return Object.freeze({
      kind: "resource-binding",
      changedPaths: Object.freeze([
        previous.renderResourceHash !== next.renderResourceHash ? "renderResourceHash" : "reflectionPolicyHash"
      ])
    });
  }
  if (
    previous.renderContractVariantKey !== next.renderContractVariantKey ||
    previous.renderStateHash !== next.renderStateHash ||
    previous.lookId !== next.lookId
  ) {
    return Object.freeze({ kind: "shader-variant", changedPaths: Object.freeze(["render-contract-structure"]) });
  }
  const changedPaths: string[] = [];
  if (previous.renderContractHash !== next.renderContractHash) changedPaths.push("renderContractValues");
  if (!same(previous.optics, next.optics)) changedPaths.push("optics");
  if (previous.refractionEnabled !== next.refractionEnabled) changedPaths.push("refractionEnabled");
  if (!same(previous.reflectionSampling, next.reflectionSampling)) changedPaths.push("reflectionSampling");
  if (previous.effectiveReflectionSource !== next.effectiveReflectionSource) {
    changedPaths.push("effectiveReflectionSource");
  }
  if (changedPaths.length > 0) {
    return Object.freeze({ kind: "uniform-only", changedPaths: Object.freeze(changedPaths) });
  }
  return Object.freeze({ kind: "none", changedPaths: Object.freeze([]) });
}
