import { describe, expect, it } from "vitest";
import {
  WaterSurfaceAppearanceDiagnosticCode,
  WaterSurfaceCoastalAlphaModel,
  WaterSurfaceContactFoamModel,
  WaterSurfaceDepthTintModel,
  WaterSurfaceNormalModel
} from "../../authoring/surface/WaterSurfaceAppearanceTypes";
import { validateWaterSurfaceAppearanceAsset } from "../../compiler/surface/WaterSurfaceAppearanceValidator";
import {
  grasslandsSurfaceAppearanceFixture,
  legacySurfaceAppearanceFixture
} from "../fixtures/waterSurfaceAppearanceFixtures";

describe("WaterSurfaceAppearanceValidator", () => {
  it("normalizes a valid full appearance and defaults flipGreen to false", () => {
    const { flipGreen: _flipGreen, ...normalWithoutFlipGreen } = grasslandsSurfaceAppearanceFixture.normal;
    const result = validateWaterSurfaceAppearanceAsset({
      ...grasslandsSurfaceAppearanceFixture,
      normal: {
        ...normalWithoutFlipGreen,
        textureContentHash: grasslandsSurfaceAppearanceFixture.normal.textureContentHash.toUpperCase()
      }
    });

    expect(result.valid).toBe(true);
    expect(result.diagnostics).toEqual([]);
    expect(result.value?.normal).toEqual(grasslandsSurfaceAppearanceFixture.normal);
    expect(result.value?.contactFoam).toEqual(grasslandsSurfaceAppearanceFixture.contactFoam);
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(result.value?.normal)).toBe(true);
    expect(Object.isFrozen(result.value?.contactFoam)).toBe(true);
  });

  it("keeps the generic schema reusable across legacy models and one foam octave", () => {
    expect(validateWaterSurfaceAppearanceAsset(legacySurfaceAppearanceFixture).valid).toBe(true);
    const singleOctave = validateWaterSurfaceAppearanceAsset({
      ...grasslandsSurfaceAppearanceFixture,
      id: "single-octave-pool",
      contactFoam: {
        ...grasslandsSurfaceAppearanceFixture.contactFoam,
        octaves: { count: 1, weights: [0.75] }
      }
    });

    expect(singleOctave.valid).toBe(true);
    expect(singleOctave.value?.contactFoam).toEqual(
      expect.objectContaining({ octaves: { count: 1, weights: [0.75] } })
    );
  });

  it("rejects malformed runtime input without throwing and reports stable paths", () => {
    expect(() => validateWaterSurfaceAppearanceAsset({ id: "broken" })).not.toThrow();
    const result = validateWaterSurfaceAppearanceAsset({ id: "broken" });

    expect(result.valid).toBe(false);
    expect(result.value).toBeUndefined();
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: WaterSurfaceAppearanceDiagnosticCode.MissingField,
          path: "$.schemaVersion"
        }),
        expect.objectContaining({ path: "$.normal" }),
        expect.objectContaining({ path: "$.depthTint" }),
        expect.objectContaining({ path: "$.coastalAlpha" }),
        expect.objectContaining({ path: "$.contactFoam" })
      ])
    );
  });

  it.each([
    [
      "$.normal.tiling",
      {
        ...grasslandsSurfaceAppearanceFixture,
        normal: { ...grasslandsSurfaceAppearanceFixture.normal, tiling: 0 }
      }
    ],
    [
      "$.normal.scrollUvPerSecond",
      {
        ...grasslandsSurfaceAppearanceFixture,
        normal: { ...grasslandsSurfaceAppearanceFixture.normal, scrollUvPerSecond: Number.NaN }
      }
    ],
    [
      "$.normal.strength",
      {
        ...grasslandsSurfaceAppearanceFixture,
        normal: { ...grasslandsSurfaceAppearanceFixture.normal, strength: 5 }
      }
    ],
    [
      "$.depthTint.color[2]",
      {
        ...grasslandsSurfaceAppearanceFixture,
        depthTint: {
          ...grasslandsSurfaceAppearanceFixture.depthTint,
          color: [0.2, 0.4, Number.POSITIVE_INFINITY, 1]
        }
      }
    ],
    [
      "$.depthTint.distance",
      {
        ...grasslandsSurfaceAppearanceFixture,
        depthTint: { ...grasslandsSurfaceAppearanceFixture.depthTint, distance: 0 }
      }
    ],
    [
      "$.depthTint.exponent",
      {
        ...grasslandsSurfaceAppearanceFixture,
        depthTint: { ...grasslandsSurfaceAppearanceFixture.depthTint, exponent: 0 }
      }
    ],
    [
      "$.coastalAlpha.distance",
      {
        ...grasslandsSurfaceAppearanceFixture,
        coastalAlpha: { ...grasslandsSurfaceAppearanceFixture.coastalAlpha, distance: 0 }
      }
    ],
    [
      "$.contactFoam.worldScale",
      {
        ...grasslandsSurfaceAppearanceFixture,
        contactFoam: { ...grasslandsSurfaceAppearanceFixture.contactFoam, worldScale: 0 }
      }
    ],
    [
      "$.contactFoam.timeRate",
      {
        ...grasslandsSurfaceAppearanceFixture,
        contactFoam: { ...grasslandsSurfaceAppearanceFixture.contactFoam, timeRate: 0 }
      }
    ],
    [
      "$.contactFoam.opacity",
      {
        ...grasslandsSurfaceAppearanceFixture,
        contactFoam: { ...grasslandsSurfaceAppearanceFixture.contactFoam, opacity: 1.1 }
      }
    ],
    [
      "$.contactFoam.contactDistance",
      {
        ...grasslandsSurfaceAppearanceFixture,
        contactFoam: { ...grasslandsSurfaceAppearanceFixture.contactFoam, contactDistance: 0 }
      }
    ],
    [
      "$.contactFoam.lacunarity",
      {
        ...grasslandsSurfaceAppearanceFixture,
        contactFoam: { ...grasslandsSurfaceAppearanceFixture.contactFoam, lacunarity: 0 }
      }
    ],
    [
      "$.contactFoam.suppressRefraction",
      {
        ...grasslandsSurfaceAppearanceFixture,
        contactFoam: { ...grasslandsSurfaceAppearanceFixture.contactFoam, suppressRefraction: -0.1 }
      }
    ],
    [
      "$.contactFoam.smoothnessReduction",
      {
        ...grasslandsSurfaceAppearanceFixture,
        contactFoam: { ...grasslandsSurfaceAppearanceFixture.contactFoam, smoothnessReduction: 1.1 }
      }
    ]
  ])("rejects invalid numeric input at %s", (path, source) => {
    const result = validateWaterSurfaceAppearanceAsset(source);

    expect(result.valid).toBe(false);
    expect(result.diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ path })]));
  });

  it("requires octave count and tuple length to agree with finite non-negative weights", () => {
    const mismatch = validateWaterSurfaceAppearanceAsset({
      ...grasslandsSurfaceAppearanceFixture,
      contactFoam: {
        ...grasslandsSurfaceAppearanceFixture.contactFoam,
        octaves: { count: 3, weights: [0.5, 0.25] }
      }
    });
    const invalidWeight = validateWaterSurfaceAppearanceAsset({
      ...grasslandsSurfaceAppearanceFixture,
      contactFoam: {
        ...grasslandsSurfaceAppearanceFixture.contactFoam,
        octaves: { count: 2, weights: [Number.NaN, -1] }
      }
    });

    expect(mismatch.valid).toBe(false);
    expect(mismatch.diagnostics).toContainEqual(
      expect.objectContaining({
        code: WaterSurfaceAppearanceDiagnosticCode.TupleLengthMismatch,
        path: "$.contactFoam.octaves.weights"
      })
    );
    expect(invalidWeight.valid).toBe(false);
    expect(invalidWeight.diagnostics.map((diagnostic) => diagnostic.path)).toEqual(
      expect.arrayContaining([
        "$.contactFoam.octaves.weights[0]",
        "$.contactFoam.octaves.weights[1]"
      ])
    );
  });

  it("rejects unstable identifiers, URLs, and malformed content hashes", () => {
    const result = validateWaterSurfaceAppearanceAsset({
      ...grasslandsSurfaceAppearanceFixture,
      id: " unstable id ",
      normal: {
        ...grasslandsSurfaceAppearanceFixture.normal,
        textureAssetId: "https://example.test/normal.png",
        textureContentHash: "not-a-sha-256"
      }
    });

    expect(result.valid).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: WaterSurfaceAppearanceDiagnosticCode.InvalidIdentifier,
          path: "$.id"
        }),
        expect.objectContaining({
          code: WaterSurfaceAppearanceDiagnosticCode.InvalidIdentifier,
          path: "$.normal.textureAssetId"
        }),
        expect.objectContaining({
          code: WaterSurfaceAppearanceDiagnosticCode.InvalidContentHash,
          path: "$.normal.textureContentHash"
        })
      ])
    );
  });

  it("fails closed for unknown tagged models", () => {
    const cases = [
      {
        ...grasslandsSurfaceAppearanceFixture,
        normal: { model: "asset-url-normal" }
      },
      {
        ...grasslandsSurfaceAppearanceFixture,
        depthTint: { model: "custom-depth" }
      },
      {
        ...grasslandsSurfaceAppearanceFixture,
        coastalAlpha: { model: "terrain-sdf" }
      },
      {
        ...grasslandsSurfaceAppearanceFixture,
        contactFoam: { model: "custom-foam" }
      }
    ];

    for (const source of cases) {
      const result = validateWaterSurfaceAppearanceAsset(source);
      expect(result.valid).toBe(false);
      expect(result.diagnostics).toContainEqual(
        expect.objectContaining({ code: WaterSurfaceAppearanceDiagnosticCode.InvalidEnum })
      );
    }
  });

  it("emits normalized pure data and drops unrecognized object or URL fields", () => {
    const result = validateWaterSurfaceAppearanceAsset({
      ...grasslandsSurfaceAppearanceFixture,
      url: "https://example.test/appearance.json",
      gpuTexture: { destroy: () => undefined },
      normal: {
        ...grasslandsSurfaceAppearanceFixture.normal,
        textureObject: { kind: "runtime-only" }
      }
    });

    expect(result.valid).toBe(true);
    expect(result.value).toEqual(grasslandsSurfaceAppearanceFixture);
    expect(JSON.parse(JSON.stringify(result.value))).toEqual(grasslandsSurfaceAppearanceFixture);
    expect("url" in (result.value as object)).toBe(false);
    expect("gpuTexture" in (result.value as object)).toBe(false);
  });

  it("keeps model tags exact for every generic branch", () => {
    expect(legacySurfaceAppearanceFixture).toEqual({
      schemaVersion: 1,
      id: "legacy-heightfield-surface",
      normal: { model: WaterSurfaceNormalModel.ProceduralSlope },
      depthTint: { model: WaterSurfaceDepthTintModel.BeerLambert },
      coastalAlpha: { model: WaterSurfaceCoastalAlphaModel.LegacyCoverage },
      contactFoam: { model: WaterSurfaceContactFoamModel.None }
    });
  });
});
