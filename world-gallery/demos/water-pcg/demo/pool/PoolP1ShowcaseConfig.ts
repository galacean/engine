export const POOL_P1_BODY_COUNTS = Object.freeze([1, 4, 8, 16] as const);

export type PoolP1BodyCount = (typeof POOL_P1_BODY_COUNTS)[number];
export type PoolLocalEffectsDebugView = "source" | "history" | "final";

export interface PoolP1ShowcaseConfig {
  readonly enabled: boolean;
  readonly bodyCount: PoolP1BodyCount;
  readonly localEffectsDebugView: PoolLocalEffectsDebugView;
  readonly temporalFoamEnabled: boolean;
  readonly bodyCountSelection: "url" | "device-tier" | "legacy";
}

export interface PoolP1DeviceProfile {
  readonly hardwareConcurrency?: number;
  readonly deviceMemoryGb?: number;
}

export interface PoolP1DeviceDefaults {
  readonly quality: "low" | "medium";
  readonly bodyCount: PoolP1BodyCount;
}

function isBodyCount(value: number): value is PoolP1BodyCount {
  return POOL_P1_BODY_COUNTS.some((candidate) => candidate === value);
}

function isDebugView(value: string | null): value is PoolLocalEffectsDebugView {
  return value === "source" || value === "history" || value === "final";
}

/** Resolves the P1 showcase without changing the legacy single-ball pool defaults. */
export function resolvePoolP1ShowcaseConfig(
  location: Pick<Location, "hash" | "search">,
  deviceDefaultBodyCount: PoolP1BodyCount = 4
): PoolP1ShowcaseConfig {
  const enabled = location.hash.replace(/^#/, "") === "p1-water-showcase";
  const parameters = new URLSearchParams(location.search);
  const requestedBodyCount = Number(parameters.get("bodies"));
  const explicitBodyCount = isBodyCount(requestedBodyCount);
  const bodyCount = explicitBodyCount ? requestedBodyCount : enabled ? deviceDefaultBodyCount : 1;
  const debugView = parameters.get("localEffectsDebug");
  return Object.freeze({
    enabled,
    bodyCount,
    localEffectsDebugView: isDebugView(debugView) ? debugView : "final",
    temporalFoamEnabled: enabled && parameters.get("temporalFoam") !== "0",
    bodyCountSelection: explicitBodyCount ? "url" : enabled ? "device-tier" : "legacy"
  });
}

/** Conservative provisional tiering; browser metrics remain authoritative and every count stays user-selectable. */
export function resolvePoolP1DeviceDefaults(profile: PoolP1DeviceProfile): PoolP1DeviceDefaults {
  const cores = Number.isFinite(profile.hardwareConcurrency) ? Math.max(1, profile.hardwareConcurrency ?? 1) : 4;
  const memoryGb = Number.isFinite(profile.deviceMemoryGb) ? Math.max(0, profile.deviceMemoryGb ?? 0) : undefined;
  if (cores <= 4 || (memoryGb !== undefined && memoryGb <= 4)) {
    return Object.freeze({ quality: "low", bodyCount: 1 });
  }
  if (cores >= 12 && (memoryGb === undefined || memoryGb >= 8)) {
    return Object.freeze({ quality: "medium", bodyCount: 8 });
  }
  return Object.freeze({ quality: "medium", bodyCount: 4 });
}
