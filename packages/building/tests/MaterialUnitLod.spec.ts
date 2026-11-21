import { describe, expect, it } from "vitest";
import { brickFeedbackLodBounds, brickLodBounds } from "../src/building/runtime/BrickUnitLod.js";
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

describe("BrickUnitLod finite bounds validation", () => {
  it("throws when brickFeedbackLodBounds pack overflows float32 or has off-row NaN", () => {
    const overflow = new Float32Array(20);
    overflow[0] = 3e38;
    overflow[3] = 3e38;
    expect(() => brickFeedbackLodBounds({ kind: "pack", count: 1, data: overflow })).toThrow(
      "Non-finite brick feedback LOD bounds"
    );

    const offRowNaN = new Float32Array(20);
    offRowNaN[0] = 1;
    offRowNaN[1] = Number.NaN;
    expect(() => brickFeedbackLodBounds({ kind: "pack", count: 1, data: offRowNaN })).toThrow(
      "Non-finite brick feedback LOD bounds"
    );
  });

  it("throws when brickLodBounds decodes non-finite off-row half-float components", () => {
    const wall64 = new Uint8Array(64);
    const dv = new DataView(wall64.buffer);
    dv.setUint16(2, 0x7c00, true); // m01 = +Infinity
    expect(() => brickLodBounds(wall64)).toThrow("Non-finite brick LOD bounds");
  });

  it("throws when brickFeedbackLodBounds grid overflows float32 bounds or cullRadius", () => {
    expect(() =>
      brickFeedbackLodBounds({
        kind: "grid",
        count: 1,
        grid: {
          columns: [1, 0, 0, 1],
          grid: [3e38, 3e38, 0, 0],
          bounds: [0, 6e38, 0, 6e38],
          strip: [0, 0, 1, 0],
          gap: [0, 0, 0, 0],
          nominal: [3e38, 3e38, 3e38],
          rangeMin: [0, 0, 0],
          rangeMax: [2, 2, 2],
          length: 0,
          groundY: 0
        }
      })
    ).toThrow("Non-finite brick feedback LOD bounds");
  });

  it("parses valid brick wall64 records cleanly", () => {
    const wall64 = new Uint8Array(64);
    const dv = new DataView(wall64.buffer);
    dv.setUint16(0, 0x3c00, true); // m00 = 1
    dv.setUint16(8, 0x3c00, true); // m11 = 1
    dv.setUint16(16, 0x3c00, true); // m22 = 1
    dv.setFloat32(20, 4, true);
    const parsed = brickLodBounds(wall64);
    expect(parsed.bounds[0]).toBe(4);
    expect(Number.isFinite(parsed.bounds[3])).toBe(true);
    expect(Number.isFinite(parsed.cullRadius[0])).toBe(true);
  });

  it("applies holes and rolling heightmap sampling in brickFeedbackLodBounds grid mode", () => {
    // 2x2 heightmap sloping from 0m (x=0) to 10m (x=10)
    const terrainGrid = {
      samples: new Uint16Array([0, 65535, 0, 65535]),
      resolution: 2,
      origin: [0, 0] as [number, number],
      size: 10,
      decode: { offset: 0, scale: 10 }
    };
    const parsed = brickFeedbackLodBounds(
      {
        kind: "grid",
        count: 4,
        grid: {
          columns: [4, 0, 0, 4],
          oddEnd: 4,
          grid: [1, 1, 0, 0],
          bounds: [0, 4, 0, 1],
          strip: [5, 5, 1, 0],
          length: 4,
          gap: [0, 0, -1, 1],
          nominal: [1, 1, 0.2],
          rangeMin: [0.25, 0.25, 0.5],
          rangeMax: [2, 2, 2],
          holes: [[1, 0, 2, 1]],
          removeCount: 1,
          terrain: {
            resolution: 2,
            origin: [0, 0],
            size: 10,
            decode: { offset: 0, scale: 10 },
            frame: { position: [0, 0, 0], rotationY: 0 }
          }
        }
      },
      terrainGrid
    );
    // Slot 0: x = 5 + (0.5 - 2) = 3.5 -> terrain height 3.5m -> brick center y = 0.5 + 3.5 = 4.0m
    expect(parsed.bounds[0]).toBeCloseTo(3.5, 5);
    expect(parsed.bounds[1]).toBeCloseTo(4.0, 5);
    expect(parsed.cullRadius[0]).toBeGreaterThan(0);
    // Slot 1: covered completely by hole [1,0,2,1] -> skipped (cullRadius = 0)
    expect(parsed.cullRadius[1]).toBe(0);
    // Slot 2: x = 5 + (2.5 - 2) = 5.5 -> terrain height 5.5m -> brick center y = 0.5 + 5.5 = 6.0m
    expect(parsed.bounds[8]).toBeCloseTo(5.5, 5);
    expect(parsed.bounds[9]).toBeCloseTo(6.0, 5);
    expect(parsed.cullRadius[2]).toBeGreaterThan(0);
  });
});
