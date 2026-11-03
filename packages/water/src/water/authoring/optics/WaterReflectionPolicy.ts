/** Engine-object-free reflection source policy shared by authoring and runtime. */
export type WaterReflectionPolicyMode = "environment" | "ssr" | "analytic";

/** User-facing reflection choices that map one-to-one to authored preferred sources. */
export type WaterReflectionPresentationMode = "environment" | "ssr";

/** Ordered, deterministic reflection-source policy. */
export interface WaterReflectionPolicy {
  readonly preferred: WaterReflectionPolicyMode;
  readonly fallbacks: readonly WaterReflectionPolicyMode[];
}

const WATER_REFLECTION_MODES = Object.freeze([
  "environment",
  "ssr",
  "analytic"
] as const satisfies readonly WaterReflectionPolicyMode[]);

function isWaterReflectionMode(value: unknown): value is WaterReflectionPolicyMode {
  return WATER_REFLECTION_MODES.includes(value as WaterReflectionPolicyMode);
}

/** Validates and snapshots one ordered reflection policy. */
export function normalizeWaterReflectionPolicy(
  policy: Readonly<WaterReflectionPolicy>
): Readonly<WaterReflectionPolicy> {
  if (!policy || typeof policy !== "object") {
    throw new TypeError("Water reflection policy must be an object.");
  }
  if (!isWaterReflectionMode(policy.preferred)) {
    throw new TypeError("Water reflection policy preferred source is invalid.");
  }
  if (!Array.isArray(policy.fallbacks)) {
    throw new TypeError("Water reflection policy fallbacks must be an array.");
  }
  const seen = new Set<WaterReflectionPolicyMode>([policy.preferred]);
  const fallbacks: WaterReflectionPolicyMode[] = [];
  for (let index = 0; index < policy.fallbacks.length; index++) {
    const fallback = policy.fallbacks[index];
    if (!isWaterReflectionMode(fallback)) {
      throw new TypeError(`Water reflection policy fallback ${index} is invalid.`);
    }
    if (seen.has(fallback)) {
      throw new Error(`Water reflection policy source '${fallback}' is duplicated.`);
    }
    seen.add(fallback);
    fallbacks.push(fallback);
  }
  return Object.freeze({
    preferred: policy.preferred,
    fallbacks: Object.freeze(fallbacks)
  });
}

export function waterReflectionPolicySourceChain(
  policy: Readonly<WaterReflectionPolicy>
): readonly WaterReflectionPolicyMode[] {
  return Object.freeze([policy.preferred, ...policy.fallbacks]);
}

/** Maps the product reflection switch to the canonical environment/SSR chain. */
export function createWaterReflectionPresentationPolicy(
  mode: WaterReflectionPresentationMode
): Readonly<WaterReflectionPolicy> {
  return mode === "ssr"
    ? normalizeWaterReflectionPolicy({
        preferred: "ssr",
        fallbacks: ["environment", "analytic"]
      })
    : normalizeWaterReflectionPolicy({
        preferred: "environment",
        fallbacks: ["analytic"]
      });
}
