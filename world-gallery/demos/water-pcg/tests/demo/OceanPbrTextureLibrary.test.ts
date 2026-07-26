import { describe, expect, it } from "vitest";
import {
  buildOceanPbrAuthoredMaps,
  buildOceanPbrDerivedMaps,
  remapOceanSandRoughness,
  type OceanPbrPixelSource
} from "../../demo/ocean/OceanPbrTextureLibrary";

function createPixelSource(): OceanPbrPixelSource {
  const width = 4;
  const height = 4;
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;
      const value = 48 + x * 38 + y * 17;
      pixels[offset] = value;
      pixels[offset + 1] = value + 8;
      pixels[offset + 2] = value + 3;
      pixels[offset + 3] = 255;
    }
  }
  return { width, height, pixels };
}

function createSolidPixelSource(
  width: number,
  height: number,
  rgba: readonly [number, number, number, number]
): OceanPbrPixelSource {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let offset = 0; offset < pixels.length; offset += 4) {
    pixels[offset] = rgba[0];
    pixels[offset + 1] = rgba[1];
    pixels[offset + 2] = rgba[2];
    pixels[offset + 3] = rgba[3];
  }
  return { width, height, pixels };
}

describe("OceanPbrTextureLibrary", () => {
  it("preserves authored sand maps and packs calibrated Galacean roughness/metallic channels", () => {
    const baseColor = createSolidPixelSource(2, 2, [181, 164, 126, 255]);
    const normal = createSolidPixelSource(2, 2, [126, 132, 252, 255]);
    const roughness = createSolidPixelSource(2, 2, [193, 193, 193, 255]);
    const occlusion = createSolidPixelSource(2, 2, [224, 224, 224, 255]);

    const maps = buildOceanPbrAuthoredMaps({
      baseColor,
      normal,
      roughness,
      occlusion
    });

    expect(maps.baseColor).toBe(baseColor.pixels);
    expect(maps.normal).toBe(normal.pixels);
    expect(maps.occlusion).toBe(occlusion.pixels);
    for (let offset = 0; offset < maps.roughnessMetallic.length; offset += 4) {
      expect(maps.roughnessMetallic[offset]).toBe(255);
      expect(maps.roughnessMetallic[offset + 1]).toBe(
        remapOceanSandRoughness(193)
      );
      expect(maps.roughnessMetallic[offset + 2]).toBe(0);
      expect(maps.roughnessMetallic[offset + 3]).toBe(255);
    }
    expect(remapOceanSandRoughness(0)).toBe(198);
    expect(remapOceanSandRoughness(255)).toBe(234);
  });

  it("rejects mismatched authored sand map dimensions", () => {
    const reference = createSolidPixelSource(2, 2, [181, 164, 126, 255]);
    expect(() =>
      buildOceanPbrAuthoredMaps({
        baseColor: reference,
        normal: createSolidPixelSource(4, 2, [126, 132, 252, 255]),
        roughness: reference,
        occlusion: reference
      })
    ).toThrow(/normal dimensions do not match base color/);
  });

  it("derives deterministic complete non-metallic PBR maps", () => {
    const source = createPixelSource();
    const first = buildOceanPbrDerivedMaps(source, "granite");
    const second = buildOceanPbrDerivedMaps(source, "granite");
    const expectedLength = source.width * source.height * 4;

    expect(first.normal).toHaveLength(expectedLength);
    expect(first.roughnessMetallic).toHaveLength(expectedLength);
    expect(first.occlusion).toHaveLength(expectedLength);
    expect(Array.from(first.normal)).toEqual(Array.from(second.normal));
    expect(Array.from(first.roughnessMetallic)).toEqual(
      Array.from(second.roughnessMetallic)
    );
    expect(Array.from(first.occlusion)).toEqual(
      Array.from(second.occlusion)
    );

    for (let offset = 0; offset < expectedLength; offset += 4) {
      expect(first.normal[offset + 2]).toBeGreaterThanOrEqual(128);
      expect(first.normal[offset + 3]).toBe(255);
      expect(first.roughnessMetallic[offset]).toBe(255);
      expect(first.roughnessMetallic[offset + 1]).toBeGreaterThan(0);
      expect(first.roughnessMetallic[offset + 2]).toBe(0);
      expect(first.roughnessMetallic[offset + 3]).toBe(255);
      expect(first.occlusion[offset]).toBeLessThanOrEqual(255);
      expect(first.occlusion[offset]).toBe(first.occlusion[offset + 1]);
      expect(first.occlusion[offset]).toBe(first.occlusion[offset + 2]);
      expect(first.occlusion[offset + 3]).toBe(255);
    }
  });

  it("uses distinct authored surface responses", () => {
    const source = createPixelSource();
    const sand = buildOceanPbrDerivedMaps(source, "sand");
    const granite = buildOceanPbrDerivedMaps(source, "granite");

    expect(Array.from(sand.normal)).not.toEqual(
      Array.from(granite.normal)
    );
    expect(Array.from(sand.roughnessMetallic)).not.toEqual(
      Array.from(granite.roughnessMetallic)
    );
    expect(Array.from(sand.occlusion)).not.toEqual(
      Array.from(granite.occlusion)
    );
  });

  it("rejects malformed pixel sources", () => {
    expect(() =>
      buildOceanPbrDerivedMaps(
        {
          width: 2,
          height: 2,
          pixels: new Uint8ClampedArray(3)
        },
        "sand"
      )
    ).toThrow(/pixel source is invalid/);
  });
});
