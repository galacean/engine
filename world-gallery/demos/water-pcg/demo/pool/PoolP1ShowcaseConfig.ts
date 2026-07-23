export const POOL_P1_BODY_COUNTS = Object.freeze([1, 4, 8, 16] as const);

export type PoolP1BodyCount = (typeof POOL_P1_BODY_COUNTS)[number];
export type PoolLocalEffectsDebugView = "source" | "history" | "final";
export type PoolCasePreset = "hero-pool" | "ripples" | "wake-foam" | "underwater" | "p1-diagnostics";

export interface PoolP1ShowcaseConfig {
  readonly preset: PoolCasePreset;
  readonly enabled: boolean;
  readonly bodyCount: PoolP1BodyCount;
  readonly localEffectsDebugView: PoolLocalEffectsDebugView;
  readonly temporalFoamEnabled: boolean;
  readonly bodyCountSelection: "url" | "showcase" | "feature" | "device-tier";
  readonly defaultQuality: "low" | "medium" | "high";
  readonly developerControls: boolean;
  readonly initialUnderwaterPreset: "outside" | "inside";
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

function isPoolCasePreset(value: string | undefined): value is PoolCasePreset {
  return (
    value === "hero-pool" ||
    value === "ripples" ||
    value === "wake-foam" ||
    value === "underwater" ||
    value === "p1-diagnostics"
  );
}

function resolvePoolCasePreset(location: Pick<Location, "hash">, explicitPreset?: string): PoolCasePreset {
  if (isPoolCasePreset(explicitPreset)) return explicitPreset;
  const caseId = location.hash.replace(/^#/, "");
  if (caseId === "feature-ripples") return "ripples";
  if (caseId === "feature-wake-foam") return "wake-foam";
  if (caseId === "feature-underwater") return "underwater";
  if (caseId === "developer-pool-diagnostics") return "p1-diagnostics";
  return "hero-pool";
}

function resolvePresetBodyCount(
  preset: PoolCasePreset,
  deviceDefaultBodyCount: PoolP1BodyCount
): Readonly<{ bodyCount: PoolP1BodyCount; selection: PoolP1ShowcaseConfig["bodyCountSelection"] }> {
  if (preset === "hero-pool" || preset === "wake-foam") return { bodyCount: 4, selection: "showcase" };
  if (preset === "p1-diagnostics") return { bodyCount: deviceDefaultBodyCount, selection: "device-tier" };
  return { bodyCount: 1, selection: "feature" };
}

/** Resolves the merged Pool showcase and its focused feature/developer presets. */
export function resolvePoolP1ShowcaseConfig(
  location: Pick<Location, "hash" | "search">,
  deviceDefaultBodyCount: PoolP1BodyCount = 4,
  explicitPreset?: string
): PoolP1ShowcaseConfig {
  const preset = resolvePoolCasePreset(location, explicitPreset);
  const parameters = new URLSearchParams(location.search);
  const requestedBodyCount = Number(parameters.get("bodies"));
  const explicitBodyCount = isBodyCount(requestedBodyCount);
  const presetBodyCount = resolvePresetBodyCount(preset, deviceDefaultBodyCount);
  const bodyCount = explicitBodyCount ? requestedBodyCount : presetBodyCount.bodyCount;
  const debugView = parameters.get("localEffectsDebug");
  const enabled = preset !== "ripples";
  const developerControls = preset === "p1-diagnostics" || parameters.get("dev") === "1";
  return Object.freeze({
    preset,
    enabled,
    bodyCount,
    localEffectsDebugView: isDebugView(debugView) ? debugView : "final",
    temporalFoamEnabled:
      (preset === "hero-pool" || preset === "wake-foam" || preset === "p1-diagnostics") &&
      parameters.get("temporalFoam") !== "0",
    bodyCountSelection: explicitBodyCount ? "url" : presetBodyCount.selection,
    defaultQuality: preset === "p1-diagnostics" ? "medium" : "high",
    developerControls,
    initialUnderwaterPreset: preset === "underwater" ? "inside" : "outside"
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
