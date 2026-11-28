/** Pure, deterministic reflection-source selection shared by runtime and tests. */
import {
  normalizeWaterReflectionPolicy,
  waterReflectionPolicySourceChain,
  type WaterReflectionPolicyMode,
  type WaterReflectionPolicy
} from "../../authoring/optics/WaterReflectionPolicy";

export type WaterReflectionSource = "sky" | "probe" | "ssr";
export type WaterReflectionQuality = "low" | "medium" | "high";
export type WaterReflectionFallbackReason = "environment-unavailable" | "ssr-unavailable" | "receiver-unsupported";

export interface WaterReflectionRequest {
  readonly id: string;
  /** The sole authored reflection-source order for this request. */
  readonly policy: Readonly<WaterReflectionPolicy>;
  readonly quality: WaterReflectionQuality;
  readonly visible: boolean;
  readonly priority: number;
  /** SSR is fail-closed unless the selected backend implements the transparent receiver contract. */
  readonly ssrEligible?: boolean;
  readonly cullingMask: number;
  readonly waterLayerMask: number;
}

export interface WaterReflectionAvailability {
  readonly probe: boolean;
  /** Camera-owned SSR is effective only after the render-pipeline support check has completed. */
  readonly ssr?: boolean;
}

const NORMALIZED_POLICY_SOURCE_CHAINS = new WeakMap<
  Readonly<WaterReflectionPolicy>,
  readonly WaterReflectionPolicyMode[]
>();

export function waterReflectionPolicyModeToSource(mode: WaterReflectionPolicyMode): WaterReflectionSource {
  switch (mode) {
    case "analytic":
      return "sky";
    case "environment":
      return "probe";
    case "ssr":
      return "ssr";
  }
}

export function waterReflectionSourceToPolicyMode(source: WaterReflectionSource): WaterReflectionPolicyMode {
  switch (source) {
    case "sky":
      return "analytic";
    case "probe":
      return "environment";
    case "ssr":
      return "ssr";
  }
}

export function normalizeWaterReflectionRequestPolicy(
  request: Pick<WaterReflectionRequest, "policy">
): Readonly<WaterReflectionPolicy> {
  return normalizeWaterReflectionPolicy(request.policy);
}

export function waterReflectionRequestMode(request: Pick<WaterReflectionRequest, "policy">): WaterReflectionPolicyMode {
  return request.policy.preferred;
}

export function waterReflectionRequestSource(request: Pick<WaterReflectionRequest, "policy">): WaterReflectionSource {
  return waterReflectionPolicyModeToSource(request.policy.preferred);
}

function sourceChain(request: Pick<WaterReflectionRequest, "policy">): readonly WaterReflectionPolicyMode[] {
  const policy = request.policy;
  const cached = NORMALIZED_POLICY_SOURCE_CHAINS.get(policy);
  if (cached) return cached;
  const chain = waterReflectionPolicySourceChain(policy);
  if (Object.isFrozen(policy) && Object.isFrozen(policy.fallbacks)) {
    NORMALIZED_POLICY_SOURCE_CHAINS.set(policy, chain);
  }
  return chain;
}

function modeAvailable(
  mode: WaterReflectionPolicyMode,
  ssrEligible: boolean,
  availability: WaterReflectionAvailability
): boolean {
  switch (mode) {
    case "analytic":
      return true;
    case "environment":
      return availability.probe;
    case "ssr":
      return ssrEligible && availability.ssr === true;
  }
}

/** First ordered source that is currently available. */
export function resolveWaterReflectionAvailableMode(
  request: Pick<WaterReflectionRequest, "policy" | "ssrEligible">,
  availability: WaterReflectionAvailability,
  ssrEligible = request.ssrEligible === true
): WaterReflectionPolicyMode | undefined {
  const chain = sourceChain(request);
  for (let index = 0; index < chain.length; index++) {
    const mode = chain[index]!;
    if (modeAvailable(mode, ssrEligible, availability)) return mode;
  }
  return undefined;
}
