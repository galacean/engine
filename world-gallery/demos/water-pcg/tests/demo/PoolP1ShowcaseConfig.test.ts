import { describe, expect, it } from "vitest";
import { resolvePoolP1DeviceDefaults, resolvePoolP1ShowcaseConfig } from "../../demo/pool/PoolP1ShowcaseConfig";

describe("Pool P1 showcase configuration", () => {
  it("preserves the legacy pool as a single-body non-temporal baseline", () => {
    expect(resolvePoolP1ShowcaseConfig({ hash: "#indoor-reflective-pool", search: "" })).toEqual({
      enabled: false,
      bodyCount: 1,
      localEffectsDebugView: "final",
      temporalFoamEnabled: false,
      bodyCountSelection: "legacy"
    });
  });

  it("enables a bounded four-body P1 showcase by default", () => {
    expect(resolvePoolP1ShowcaseConfig({ hash: "#p1-water-showcase", search: "" })).toEqual({
      enabled: true,
      bodyCount: 4,
      localEffectsDebugView: "final",
      temporalFoamEnabled: true,
      bodyCountSelection: "device-tier"
    });
  });

  it("accepts only the measured body-count and debug-view matrix", () => {
    expect(
      resolvePoolP1ShowcaseConfig({
        hash: "#p1-water-showcase",
        search: "?bodies=16&localEffectsDebug=history&temporalFoam=0"
      })
    ).toMatchObject({ bodyCount: 16, localEffectsDebugView: "history", temporalFoamEnabled: false });
    expect(
      resolvePoolP1ShowcaseConfig({ hash: "#p1-water-showcase", search: "?bodies=7&localEffectsDebug=unknown" })
    ).toMatchObject({ bodyCount: 4, localEffectsDebugView: "final" });
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
