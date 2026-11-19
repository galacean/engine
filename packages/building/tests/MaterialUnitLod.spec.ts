import { describe, expect, it } from "vitest";
import { MaterialUnitLod } from "../src/building/runtime/MaterialUnitLod.js";

function identityView(cameraZ: number): Float32Array {
  // Column-major view matrix translating world origin along -Z by cameraZ,
  // so depth = -(view[2]*x + view[6]*y + view[10]*z + view[14]) = cameraZ - z.
  return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -cameraZ, 1]);
}

describe("MaterialUnitLod", () => {
  it("clears fade flags in steady all-high and all-low states and sets them in the overlap band", () => {
    // Two units at z=0 with radius 1.0; transition band [10, 20] px.
    const bounds = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1]);
    const force = new Uint8Array([0, 0]);
    const lod = new MaterialUnitLod(bounds, force, 10, 20);

    // Close camera: size = 100 / 2 = 50 > 20 -> weight = 1 (all high, no fade).
    expect(lod.update(identityView(2), 100, false)).toBe(true);
    expect(lod.highCount).toBe(2);
    expect(lod.lowCount).toBe(0);
    expect(lod.hasHighFade).toBe(false);
    expect(lod.hasLowFade).toBe(false);

    // Unchanged camera returns false without re-uploading.
    expect(lod.update(identityView(2), 100, false)).toBe(false);

    // Mid camera: size = 100 / (100/15) = 15 -> weight = 0.5 (overlap band: both fade flags true).
    expect(lod.update(identityView(100 / 15), 100, false)).toBe(true);
    expect(lod.highCount).toBe(2);
    expect(lod.lowCount).toBe(2);
    expect(lod.hasHighFade).toBe(true);
    expect(lod.hasLowFade).toBe(true);
    expect(lod.highFade[0]).toBe(0.5);
    expect(lod.lowFade[0]).toBe(0.5);

    // Far camera: size = 100 / 25 = 4 < 10 -> weight = 0 (all low, no fade).
    expect(lod.update(identityView(25), 100, false)).toBe(true);
    expect(lod.highCount).toBe(0);
    expect(lod.lowCount).toBe(2);
    expect(lod.hasHighFade).toBe(false);
    expect(lod.hasLowFade).toBe(false);
  });

  it("tracks mixed steady/fading units and respects force flags and forced LOD levels", () => {
    // Unit 0 pinned to high (force=1), Unit 1 free at z=0.
    const bounds = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1]);
    const force = new Uint8Array([1, 0]);
    const lod = new MaterialUnitLod(bounds, force, 10, 20);

    // Far camera: Unit 0 forced high (weight=1), Unit 1 all low (weight=0) -> neither fading.
    expect(lod.update(identityView(25), 100, false)).toBe(true);
    expect(lod.highCount).toBe(1);
    expect(lod.lowCount).toBe(1);
    expect(lod.high[0]).toBe(0);
    expect(lod.low[0]).toBe(1);
    expect(lod.hasHighFade).toBe(false);
    expect(lod.hasLowFade).toBe(false);

    // Move Unit 1 into transition band -> both highFade & lowFade become true even though Unit 0 is steady.
    expect(lod.update(identityView(100 / 15), 100, false)).toBe(true);
    expect(lod.hasHighFade).toBe(true);
    expect(lod.hasLowFade).toBe(true);

    // Forced LOD 0 overrides distance and clears fade flags.
    expect(lod.update(identityView(100 / 15), 100, false, 1, 0)).toBe(true);
    expect(lod.highCount).toBe(2);
    expect(lod.lowCount).toBe(0);
    expect(lod.hasHighFade).toBe(false);
    expect(lod.hasLowFade).toBe(false);
  });
});
