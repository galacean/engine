import { expect, it, vi } from "vitest";
import {
  bakeSeedWorldSurfaceReliefMask,
  packSeedWorldSurfaceReliefMask,
  prepareSurfaceReliefMask,
  sameSurfaceReliefCoverage
} from "@galacean/engine-world-planning/runtime/SeedWorldSurfaceRelief";
import { SeedWorldSurfaceReliefRuntime } from "@galacean/engine-world-planning/runtime/SeedWorldSurfaceReliefRuntime";
function fixture() {
  const fields = { sizeMetres: 16, surfaceResolution: 8, waterMask: new Uint8Array(64) };
  const intent: any = {
    resolution: 8,
    materialWeights: Uint8Array.from({ length: 256 }, (_, i) => (i * 17) % 256),
    riverBedCoverage: Uint8Array.from({ length: 64 }, (_, i) => i * 3)
  };
  const tuning = { enabled: true, roadEnabled: true, maskCoverageStart: 0.17, maskSoftnessMetres: 0.5 };
  const texture = { destroy: vi.fn() };
  const runtime = Object.assign(Object.create(SeedWorldSurfaceReliefRuntime.prototype), {
    fields,
    intent,
    tuning,
    maskTexture: texture,
    bindings: new Set(),
    disposed: false
  });
  return { fields, intent, tuning, texture, runtime };
}
it("preserves every mask and derivative byte across structured worker transfer", () => {
  const f = fixture();
  for (const tuning of [
    f.tuning,
    { maskCoverageStart: 0, maskSoftnessMetres: 0 },
    { maskCoverageStart: 0.6, maskSoftnessMetres: 3 }
  ]) {
    const prepared = structuredClone(prepareSurfaceReliefMask(f.fields, f.intent, tuning));
    expect(prepared.pixels).toEqual(
      packSeedWorldSurfaceReliefMask(bakeSeedWorldSurfaceReliefMask(f.fields, f.intent, tuning), 8, 16)
    );
  }
  expect(() => prepareSurfaceReliefMask(f.fields, { ...f.intent, resolution: 9 }, f.tuning)).toThrow();
});
it.each(["finalize", "discard"] as const)(
  "reuses unchanged effective coverage without retiring the shared mask on %s",
  (mode) => {
    const f = fixture(),
      next = structuredClone(f.intent);
    next.materialWeights[1] ^= 1;
    expect(sameSurfaceReliefCoverage(f.intent, next)).toBe(true);
    const update = f.runtime.prepareFields(f.fields, next, prepareSurfaceReliefMask(f.fields, next, f.tuning));
    update.commit();
    expect(f.runtime.maskTexture).toBe(f.texture);
    update[mode]();
    expect(f.texture.destroy).not.toHaveBeenCalled();
    expect(f.runtime.intent).toBe(mode === "discard" ? f.intent : next);
    next.materialWeights[0] ^= 127;
    expect(sameSurfaceReliefCoverage(f.intent, next)).toBe(false);
  }
);
it("rejects stale tuning, malformed worker output and tuning changes before commit", () => {
  const f = fixture(),
    prepared = prepareSurfaceReliefMask(f.fields, f.intent, f.tuning);
  expect(() => f.runtime.prepareFields(f.fields, f.intent, { ...prepared, pixels: new Uint8Array(1) })).toThrow();
  expect(() =>
    f.runtime.prepareFields(f.fields, f.intent, { ...prepared, tuning: { ...f.tuning, maskSoftnessMetres: 1 } })
  ).toThrow();
  const update = f.runtime.prepareFields(f.fields, f.intent, prepared);
  f.runtime.tuning = { ...f.tuning, maskSoftnessMetres: 1 };
  expect(() => update.commit()).toThrow("Stale");
  update.discard();
  expect(f.texture.destroy).not.toHaveBeenCalled();
});
