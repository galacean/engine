import { describe, expect, it, vi } from "vitest";
import {
  createFeatureSnapshot,
  createWaterFeatureCaseApi
} from "../../demo/showcase/WaterFeatureCaseApi";

describe("WaterFeatureCaseApi", () => {
  it("binds one subsystem's On/Off/Reset state and zeros only its disabled signal", () => {
    let ready = true;
    let runtimeError = "";
    let signal = 7;
    const setEnabled = vi.fn();
    const reset = vi.fn();
    const api = createWaterFeatureCaseApi({
      caseId: "feature-ocean-breakers",
      preset: "ocean-breakers",
      getReady: () => ready,
      getRuntimeError: () => runtimeError,
      setEnabled,
      reset,
      getSignal: () => signal
    });

    expect(api.snapshot()).toEqual({
      caseId: "feature-ocean-breakers",
      preset: "ocean-breakers",
      ready: true,
      enabled: true,
      finite: true,
      runtimeError: "",
      signal: 7
    });

    api.setEnabled(false);
    expect(setEnabled).toHaveBeenLastCalledWith(false);
    expect(api.enabled).toBe(false);
    expect(api.snapshot().signal).toBe(0);

    signal = 11;
    ready = false;
    runtimeError = "not ready";
    api.reset();
    expect(reset).toHaveBeenCalledTimes(1);
    expect(api.enabled).toBe(true);
    expect(api.snapshot()).toMatchObject({
      ready: false,
      enabled: true,
      runtimeError: "not ready",
      signal: 11
    });
  });

  it("reports non-finite source signals without leaking them into acceptance data", () => {
    const api = createWaterFeatureCaseApi({
      caseId: "feature-ocean-wetness",
      preset: "ocean-wetness",
      getReady: () => true,
      getRuntimeError: () => "",
      setEnabled: () => undefined,
      reset: () => undefined,
      getSignal: () => Number.POSITIVE_INFINITY
    });

    expect(api.snapshot()).toMatchObject({
      finite: false,
      signal: 0
    });
    const snapshot = createFeatureSnapshot(
      api,
      "runtime failed",
      false,
      Number.NaN
    );
    expect(snapshot).toMatchObject({
      runtimeError: "runtime failed",
      finite: false,
      signal: 0
    });
    expect(Object.isFrozen(snapshot)).toBe(true);
  });
});
