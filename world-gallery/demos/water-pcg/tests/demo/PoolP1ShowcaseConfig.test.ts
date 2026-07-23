import { describe, expect, it } from "vitest";
import { resolvePoolP1DeviceDefaults, resolvePoolP1ShowcaseConfig } from "../../demo/pool/PoolP1ShowcaseConfig";

describe("Pool P1 showcase configuration", () => {
  it("maps the legacy interactive pool to the merged High four-body showcase", () => {
    expect(resolvePoolP1ShowcaseConfig({ hash: "#indoor-reflective-pool", search: "" })).toEqual({
      preset: "hero-pool",
      enabled: true,
      bodyCount: 4,
      localEffectsDebugView: "final",
      temporalFoamEnabled: true,
      bodyCountSelection: "showcase",
      defaultQuality: "high",
      developerControls: false,
      initialUnderwaterPreset: "outside"
    });
  });

  it("maps the legacy P1 route to the same bounded four-body showcase", () => {
    expect(resolvePoolP1ShowcaseConfig({ hash: "#p1-water-showcase", search: "" })).toEqual({
      preset: "hero-pool",
      enabled: true,
      bodyCount: 4,
      localEffectsDebugView: "final",
      temporalFoamEnabled: true,
      bodyCountSelection: "showcase",
      defaultQuality: "high",
      developerControls: false,
      initialUnderwaterPreset: "outside"
    });
  });

  it("accepts only the measured body-count and debug-view matrix", () => {
    expect(
      resolvePoolP1ShowcaseConfig(
        {
          hash: "#developer-pool-diagnostics",
          search: "?bodies=16&localEffectsDebug=history&temporalFoam=0"
        },
        4,
        "p1-diagnostics"
      )
    ).toMatchObject({ bodyCount: 16, localEffectsDebugView: "history", temporalFoamEnabled: false });
    expect(
      resolvePoolP1ShowcaseConfig({ hash: "#p1-water-showcase", search: "?bodies=7&localEffectsDebug=unknown" })
    ).toMatchObject({ bodyCount: 4, localEffectsDebugView: "final" });
  });

  it("keeps each public feature focused and reserves pressure controls for developer mode", () => {
    expect(resolvePoolP1ShowcaseConfig({ hash: "#feature-ripples", search: "" })).toMatchObject({
      preset: "ripples",
      enabled: false,
      bodyCount: 1,
      temporalFoamEnabled: false,
      bodyCountSelection: "feature",
      developerControls: false
    });
    expect(resolvePoolP1ShowcaseConfig({ hash: "#feature-underwater", search: "" })).toMatchObject({
      preset: "underwater",
      enabled: true,
      bodyCount: 1,
      temporalFoamEnabled: false,
      initialUnderwaterPreset: "inside"
    });
    expect(resolvePoolP1ShowcaseConfig({ hash: "#developer-pool-diagnostics", search: "" }, 8)).toMatchObject({
      preset: "p1-diagnostics",
      bodyCount: 8,
      bodyCountSelection: "device-tier",
      developerControls: true
    });
  });

  it("uses conservative browser-device tiers while keeping 16 bodies opt-in", () => {
    expect(resolvePoolP1DeviceDefaults({ hardwareConcurrency: 4, deviceMemoryGb: 4 })).toEqual({
      quality: "low",
      bodyCount: 1
    });
    expect(resolvePoolP1DeviceDefaults({ hardwareConcurrency: 8, deviceMemoryGb: 8 })).toEqual({
      quality: "medium",
      bodyCount: 4
    });
    expect(resolvePoolP1DeviceDefaults({ hardwareConcurrency: 12, deviceMemoryGb: 16 })).toEqual({
      quality: "medium",
      bodyCount: 8
    });
  });
});
