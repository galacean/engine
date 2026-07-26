import type { Texture2D } from "@galacean/engine-core";
import { describe, expect, it, vi } from "vitest";
import {
  WaterSurfaceCoastalAlphaModel,
  WaterSurfaceContactFoamModel,
  WaterSurfaceDepthTintModel
} from "../../authoring/surface/WaterSurfaceAppearanceTypes";
import { WaterSurfaceAppearanceCompiler } from "../../compiler/surface/WaterSurfaceAppearanceCompiler";
import {
  resolveWaterSurfaceAppearanceBinding,
  writeWaterSurfaceAppearanceBindingReadback
} from "../../runtime/surface/WaterSurfaceAppearanceBinding";
import type {
  WaterSurfaceAppearanceBinding,
  WaterSurfaceAppearanceBindingReadback
} from "../../runtime/surface/WaterSurfaceAppearanceRuntimeTypes";
import {
  grasslandsSurfaceAppearanceFixture,
  legacySurfaceAppearanceFixture
} from "../fixtures/waterSurfaceAppearanceFixtures";

function createTexture(overrides: Partial<{ width: number; height: number; destroyed: boolean }> = {}): Texture2D {
  return {
    width: 1024,
    height: 1024,
    destroyed: false,
    destroy: vi.fn(),
    ...overrides
  } as unknown as Texture2D;
}

function createBinding(overrides: Partial<WaterSurfaceAppearanceBinding> = {}): WaterSurfaceAppearanceBinding {
  return {
    appearance: WaterSurfaceAppearanceCompiler.compile(grasslandsSurfaceAppearanceFixture).data!,
    assetId: grasslandsSurfaceAppearanceFixture.normal.textureAssetId,
    contentHash: grasslandsSurfaceAppearanceFixture.normal.textureContentHash,
    texture: createTexture(),
    ownership: "borrowed",
    ...overrides
  };
}

function createMutableReadback(): WaterSurfaceAppearanceBindingReadback {
  return {
    requested: false,
    active: false,
    normalTextureWidth: 0,
    normalTextureHeight: 0,
    normalLayerCount: 0,
    normalTiling: 0,
    normalScrollUvPerSecond: 0,
    normalStrength: 0,
    flipGreen: false,
    depthTintEnabled: false,
    depthTintDistance: 0,
    depthTintExponent: 0,
    coastalAlphaEnabled: false,
    coastalAlphaDistance: 0,
    contactFoamEnabled: false,
    contactFoamWorldScale: 0,
    contactFoamTimeRate: 0,
    contactFoamOpacity: 0,
    contactFoamContactDistance: 0,
    contactFoamOctaveCount: 0,
    contactFoamWeights: [],
    contactFoamLacunarity: 0,
    contactFoamSuppressRefraction: 0,
    contactFoamSmoothnessReduction: 0
  };
}

describe("WaterSurfaceAppearanceBinding", () => {
  it("resolves a matching borrowed external normal with exact deterministic readback", () => {
    const binding = createBinding();
    const resolution = resolveWaterSurfaceAppearanceBinding(binding);

    expect(resolution.binding).toBe(binding);
    expect(resolution.readback).toEqual({
      requested: true,
      active: true,
      appearanceAssetId: "grasslands-stylized-water",
      appearanceHash: "3c1b8afc55c7059b",
      variantKey: "surface-appearance-v1",
      normalAssetId: "grasslands-water-normal-1024",
      normalContentHash: "0d9bfdded6d8c46cff4afe145cf052ec31f079ae03d89b73599ccb7807c02332",
      normalTextureWidth: 1024,
      normalTextureHeight: 1024,
      normalLayerCount: 2,
      normalTiling: 0.05,
      normalScrollUvPerSecond: 0.02,
      normalStrength: 0.2,
      flipGreen: false,
      depthTintModel: "scene-depth-power",
      depthTintEnabled: true,
      depthTintColor: [0.21710525, 0.45953944, 0.55, 1],
      depthTintDistance: 10,
      depthTintExponent: 0.5,
      coastalAlphaModel: "scene-depth",
      coastalAlphaEnabled: true,
      coastalAlphaDistance: 0.5,
      contactFoamModel: "scene-depth-voronoi",
      contactFoamEnabled: true,
      contactFoamWorldScale: 2.5,
      contactFoamTimeRate: 1,
      contactFoamOpacity: 0.453,
      contactFoamContactDistance: 0.1791,
      contactFoamOctaveCount: 3,
      contactFoamWeights: [0.5, 0.25, 0.125],
      contactFoamLacunarity: 2,
      contactFoamSuppressRefraction: 1,
      contactFoamSmoothnessReduction: 0.35,
      ownership: "borrowed",
      fallbackReason: undefined
    });
  });

  it("treats an intentional detach as legacy without a fallback error", () => {
    expect(resolveWaterSurfaceAppearanceBinding().readback).toEqual({
      requested: false,
      active: false,
      appearanceAssetId: undefined,
      appearanceHash: undefined,
      variantKey: undefined,
      normalAssetId: undefined,
      normalContentHash: undefined,
      normalTextureWidth: 0,
      normalTextureHeight: 0,
      normalLayerCount: 0,
      normalTiling: 0,
      normalScrollUvPerSecond: 0,
      normalStrength: 0,
      flipGreen: false,
      depthTintModel: undefined,
      depthTintEnabled: false,
      depthTintColor: undefined,
      depthTintDistance: 0,
      depthTintExponent: 0,
      coastalAlphaModel: undefined,
      coastalAlphaEnabled: false,
      coastalAlphaDistance: 0,
      contactFoamModel: undefined,
      contactFoamEnabled: false,
      contactFoamWorldScale: 0,
      contactFoamTimeRate: 0,
      contactFoamOpacity: 0,
      contactFoamContactDistance: 0,
      contactFoamOctaveCount: 0,
      contactFoamWeights: [],
      contactFoamLacunarity: 0,
      contactFoamSuppressRefraction: 0,
      contactFoamSmoothnessReduction: 0,
      ownership: undefined,
      fallbackReason: undefined
    });
  });

  it.each([
    ["surface-appearance-quality-unsupported", createBinding(), false],
    [
      "surface-appearance-normal-model-unsupported",
      createBinding({
        appearance: WaterSurfaceAppearanceCompiler.compile(legacySurfaceAppearanceFixture).data!
      }),
      true
    ],
    ["surface-appearance-asset-id-mismatch", createBinding({ assetId: "wrong-normal" }), true],
    ["surface-appearance-content-hash-mismatch", createBinding({ contentHash: "1".repeat(64) }), true],
    ["surface-appearance-texture-unavailable", createBinding({ texture: createTexture({ destroyed: true }) }), true],
    ["surface-appearance-texture-unavailable", createBinding({ texture: createTexture({ width: 0 }) }), true]
  ] as const)("fails closed with %s", (fallbackReason, binding, qualitySupported) => {
    const resolution = resolveWaterSurfaceAppearanceBinding(binding, qualitySupported);

    expect(resolution.binding).toBeUndefined();
    expect(resolution.readback).toMatchObject({
      requested: true,
      active: false,
      fallbackReason,
      normalLayerCount: 0
    });
  });

  it("does not throw for malformed JS input and reports ownership/hash failures", () => {
    const invalidOwnership = { ...createBinding(), ownership: "owned" } as unknown as WaterSurfaceAppearanceBinding;
    const invalidHash = { ...createBinding(), contentHash: undefined } as unknown as WaterSurfaceAppearanceBinding;

    expect(() => resolveWaterSurfaceAppearanceBinding(invalidOwnership)).not.toThrow();
    expect(resolveWaterSurfaceAppearanceBinding(invalidOwnership).readback.fallbackReason).toBe(
      "surface-appearance-ownership-invalid"
    );
    expect(() => resolveWaterSurfaceAppearanceBinding(invalidHash)).not.toThrow();
    expect(resolveWaterSurfaceAppearanceBinding(invalidHash).readback.fallbackReason).toBe(
      "surface-appearance-content-hash-mismatch"
    );
  });

  it.each([
    ["missing normal", { variantKey: "surface-appearance-v1" }],
    ["unsupported schema", { ...createBinding().appearance, schemaVersion: 2 }],
    ["missing source id", { ...createBinding().appearance, sourceId: "" }],
    ["invalid appearance hash", { ...createBinding().appearance, appearanceHash: "not-a-hash" }],
    [
      "unsupported normal sampling",
      {
        ...createBinding().appearance,
        normal: { ...createBinding().appearance.normal, sampling: "screen-uv" }
      }
    ]
  ] as const)("fails malformed compiled data closed without throwing: %s", (_label, appearance) => {
    const binding = { ...createBinding(), appearance } as unknown as WaterSurfaceAppearanceBinding;

    expect(() => resolveWaterSurfaceAppearanceBinding(binding)).not.toThrow();
    expect(resolveWaterSurfaceAppearanceBinding(binding).readback).toMatchObject({
      requested: true,
      active: false,
      fallbackReason: "surface-appearance-compiled-data-unavailable"
    });
  });

  it("accepts caller hash casing but reports the compiled canonical content hash", () => {
    const binding = createBinding({
      contentHash: grasslandsSurfaceAppearanceFixture.normal.textureContentHash.toUpperCase()
    });

    expect(resolveWaterSurfaceAppearanceBinding(binding).readback).toMatchObject({
      active: true,
      normalContentHash: grasslandsSurfaceAppearanceFixture.normal.textureContentHash
    });
  });

  it("accepts the compiler contract's signed scroll and full normal-strength range", () => {
    const appearance = WaterSurfaceAppearanceCompiler.compile({
      ...grasslandsSurfaceAppearanceFixture,
      normal: {
        ...grasslandsSurfaceAppearanceFixture.normal,
        scrollUvPerSecond: -0.02,
        strength: 4
      }
    }).data!;

    expect(resolveWaterSurfaceAppearanceBinding(createBinding({ appearance })).readback).toMatchObject({
      active: true,
      normalScrollUvPerSecond: -0.02,
      normalStrength: 4
    });
  });

  it("reports legacy depth-tint and coastal-alpha models without activating their appearance paths", () => {
    const appearance = WaterSurfaceAppearanceCompiler.compile({
      ...grasslandsSurfaceAppearanceFixture,
      depthTint: { model: WaterSurfaceDepthTintModel.BeerLambert },
      coastalAlpha: { model: WaterSurfaceCoastalAlphaModel.LegacyCoverage }
    }).data!;

    expect(resolveWaterSurfaceAppearanceBinding(createBinding({ appearance })).readback).toMatchObject({
      active: true,
      depthTintModel: WaterSurfaceDepthTintModel.BeerLambert,
      depthTintEnabled: false,
      depthTintColor: undefined,
      depthTintDistance: 0,
      depthTintExponent: 0,
      coastalAlphaModel: WaterSurfaceCoastalAlphaModel.LegacyCoverage,
      coastalAlphaEnabled: false,
      coastalAlphaDistance: 0
    });
  });

  it("accepts the none contact-foam model and clears all contact-foam values", () => {
    const appearance = WaterSurfaceAppearanceCompiler.compile({
      ...grasslandsSurfaceAppearanceFixture,
      contactFoam: { model: WaterSurfaceContactFoamModel.None }
    }).data!;

    expect(resolveWaterSurfaceAppearanceBinding(createBinding({ appearance })).readback).toMatchObject({
      active: true,
      contactFoamModel: WaterSurfaceContactFoamModel.None,
      contactFoamEnabled: false,
      contactFoamWorldScale: 0,
      contactFoamTimeRate: 0,
      contactFoamOpacity: 0,
      contactFoamContactDistance: 0,
      contactFoamOctaveCount: 0,
      contactFoamWeights: [],
      contactFoamLacunarity: 0,
      contactFoamSuppressRefraction: 0,
      contactFoamSmoothnessReduction: 0
    });
  });

  it.each([
    ["unsupported depth-tint model", { depthTint: { model: "screen-depth-ramp" } }],
    [
      "malformed depth-tint color",
      {
        depthTint: {
          ...createBinding().appearance.depthTint,
          color: [0.2, 0.4, Number.NaN, 1]
        }
      }
    ],
    [
      "out-of-range depth-tint color",
      {
        depthTint: {
          ...createBinding().appearance.depthTint,
          color: [0.2, 0.4, 1.1, 1]
        }
      }
    ],
    [
      "invalid depth-tint distance",
      {
        depthTint: {
          ...createBinding().appearance.depthTint,
          distance: 0
        }
      }
    ],
    [
      "invalid depth-tint exponent",
      {
        depthTint: {
          ...createBinding().appearance.depthTint,
          exponent: 33
        }
      }
    ],
    ["unsupported coastal-alpha model", { coastalAlpha: { model: "heightfield-sdf" } }],
    [
      "invalid coastal-alpha distance",
      {
        coastalAlpha: {
          ...createBinding().appearance.coastalAlpha,
          distance: 100_001
        }
      }
    ]
  ] as const)("fails malformed compiled depth/coastal data closed without throwing: %s", (_label, override) => {
    const appearance = {
      ...createBinding().appearance,
      ...override
    };
    const binding = { ...createBinding(), appearance } as unknown as WaterSurfaceAppearanceBinding;

    expect(() => resolveWaterSurfaceAppearanceBinding(binding)).not.toThrow();
    expect(resolveWaterSurfaceAppearanceBinding(binding).readback).toMatchObject({
      requested: true,
      active: false,
      depthTintModel: undefined,
      depthTintEnabled: false,
      depthTintColor: undefined,
      depthTintDistance: 0,
      depthTintExponent: 0,
      coastalAlphaModel: undefined,
      coastalAlphaEnabled: false,
      coastalAlphaDistance: 0,
      fallbackReason: "surface-appearance-compiled-data-unavailable"
    });
  });

  it.each([
    ["unsupported model", { model: "heightfield-sdf" }],
    ["invalid world scale lower bound", { ...createBinding().appearance.contactFoam, worldScale: 0 }],
    ["invalid world scale upper bound", { ...createBinding().appearance.contactFoam, worldScale: 100_001 }],
    ["non-finite world scale", { ...createBinding().appearance.contactFoam, worldScale: Number.NaN }],
    ["invalid time rate lower bound", { ...createBinding().appearance.contactFoam, timeRate: 0 }],
    ["invalid time rate upper bound", { ...createBinding().appearance.contactFoam, timeRate: 1_025 }],
    ["invalid opacity lower bound", { ...createBinding().appearance.contactFoam, opacity: 0 }],
    ["invalid opacity upper bound", { ...createBinding().appearance.contactFoam, opacity: 1.001 }],
    ["invalid contact distance lower bound", { ...createBinding().appearance.contactFoam, contactDistance: 0 }],
    ["invalid contact distance upper bound", { ...createBinding().appearance.contactFoam, contactDistance: 100_001 }],
    [
      "octave count is not an integer",
      {
        ...createBinding().appearance.contactFoam,
        octaves: { count: 2.5, weights: [0.5, 0.25] }
      }
    ],
    [
      "octave count is outside the contract",
      {
        ...createBinding().appearance.contactFoam,
        octaves: { count: 4, weights: [0.5, 0.25, 0.125, 0.0625] }
      }
    ],
    [
      "octave tuple length mismatches count",
      {
        ...createBinding().appearance.contactFoam,
        octaves: { count: 3, weights: [0.5, 0.25] }
      }
    ],
    [
      "octave weight is negative",
      {
        ...createBinding().appearance.contactFoam,
        octaves: { count: 3, weights: [0.5, -0.25, 0.125] }
      }
    ],
    [
      "octave weight is not finite",
      {
        ...createBinding().appearance.contactFoam,
        octaves: { count: 3, weights: [0.5, Number.POSITIVE_INFINITY, 0.125] }
      }
    ],
    ["invalid lacunarity lower bound", { ...createBinding().appearance.contactFoam, lacunarity: 0 }],
    ["invalid lacunarity upper bound", { ...createBinding().appearance.contactFoam, lacunarity: 65 }],
    [
      "invalid refraction suppression lower bound",
      { ...createBinding().appearance.contactFoam, suppressRefraction: -0.001 }
    ],
    [
      "invalid refraction suppression upper bound",
      { ...createBinding().appearance.contactFoam, suppressRefraction: 1.001 }
    ],
    [
      "invalid smoothness reduction lower bound",
      { ...createBinding().appearance.contactFoam, smoothnessReduction: -0.001 }
    ],
    [
      "invalid smoothness reduction upper bound",
      { ...createBinding().appearance.contactFoam, smoothnessReduction: 1.001 }
    ]
  ] as const)("fails malformed compiled contact foam closed without throwing: %s", (_label, contactFoam) => {
    const appearance = {
      ...createBinding().appearance,
      contactFoam
    };
    const binding = { ...createBinding(), appearance } as unknown as WaterSurfaceAppearanceBinding;

    expect(() => resolveWaterSurfaceAppearanceBinding(binding)).not.toThrow();
    expect(resolveWaterSurfaceAppearanceBinding(binding).readback).toMatchObject({
      requested: true,
      active: false,
      contactFoamModel: undefined,
      contactFoamEnabled: false,
      contactFoamWorldScale: 0,
      contactFoamTimeRate: 0,
      contactFoamOpacity: 0,
      contactFoamContactDistance: 0,
      contactFoamOctaveCount: 0,
      contactFoamWeights: [],
      contactFoamLacunarity: 0,
      contactFoamSuppressRefraction: 0,
      contactFoamSmoothnessReduction: 0,
      fallbackReason: "surface-appearance-compiled-data-unavailable"
    });
  });

  it("updates one stable readback object and clears stale active fields on fallback", () => {
    const target = createMutableReadback();
    const active = resolveWaterSurfaceAppearanceBinding(createBinding()).readback;
    const fallback = resolveWaterSurfaceAppearanceBinding(createBinding({ assetId: "wrong-normal" })).readback;

    writeWaterSurfaceAppearanceBindingReadback(target, active);
    expect(target.active).toBe(true);
    expect(target.normalTextureWidth).toBe(1024);
    expect(target.depthTintDistance).toBe(10);
    expect(target.coastalAlphaDistance).toBe(0.5);
    expect(target.contactFoamWeights).toEqual([0.5, 0.25, 0.125]);
    writeWaterSurfaceAppearanceBindingReadback(target, fallback);
    expect(target).toMatchObject({
      active: false,
      normalTextureWidth: 0,
      normalLayerCount: 0,
      depthTintModel: undefined,
      depthTintEnabled: false,
      depthTintColor: undefined,
      depthTintDistance: 0,
      depthTintExponent: 0,
      coastalAlphaModel: undefined,
      coastalAlphaEnabled: false,
      coastalAlphaDistance: 0,
      contactFoamModel: undefined,
      contactFoamEnabled: false,
      contactFoamWorldScale: 0,
      contactFoamTimeRate: 0,
      contactFoamOpacity: 0,
      contactFoamContactDistance: 0,
      contactFoamOctaveCount: 0,
      contactFoamWeights: [],
      contactFoamLacunarity: 0,
      contactFoamSuppressRefraction: 0,
      contactFoamSmoothnessReduction: 0,
      fallbackReason: "surface-appearance-asset-id-mismatch"
    });
  });
});
