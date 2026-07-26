import { beforeEach, describe, expect, it, vi } from "vitest";

const runtimeMocks = vi.hoisted(() => ({
  uploadHeightfieldWaterMesh: vi.fn(() => ({
    surfaceMesh: { isGCIgnored: false, destroy: vi.fn() }
  })),
  createHeightfieldWaterLocalMapTexture: vi.fn(() => ({
    isGCIgnored: false,
    destroy: vi.fn()
  })),
  createHeightfieldWaterMaterial: vi.fn((_engine: unknown, quality: unknown, waveSet: unknown) => ({
    quality,
    waveSet,
    material: { isGCIgnored: false, destroy: vi.fn() },
    heightfieldReflectionReadback: {
      effectiveSource: "sky",
      textureWidth: 0,
      textureHeight: 0,
      distortionStrength: 0.025,
      filterSampleCount: 1
    },
    surfaceOpticsReadback: {},
    opticsCalibrationReadback: {
      mode: 0,
      referenceCompositionEnabled: false,
      effectiveFresnelOverride: undefined
    },
    surfaceAppearanceReadback: {
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
    },
    surfaceAppearanceFeatureFlags: {
      externalNormal: true,
      depthTint: true,
      coastalAlpha: true,
      contactFoam: true,
      directSpecular: true
    }
  })),
  updateHeightfieldWaterMaterial: vi.fn(),
  setHeightfieldWaterCompositionMode: vi.fn(),
  setHeightfieldWaterDebugMode: vi.fn(),
  setHeightfieldWaterDepthWriteEnabled: vi.fn(),
  setHeightfieldWaterFeatureFlags: vi.fn(),
  setHeightfieldWaterSurfaceAppearanceFeatureFlags: vi.fn(
    (
      state: {
        surfaceAppearanceFeatureFlags: Record<string, boolean>;
      },
      flags: Readonly<Record<string, boolean>>
    ) => {
      Object.assign(state.surfaceAppearanceFeatureFlags, flags);
    }
  ),
  setHeightfieldWaterLocalFoamMask: vi.fn(),
  setHeightfieldWaterOpticsCalibrationMode: vi.fn(
    (
      state: {
        opticsCalibrationReadback: {
          mode: number;
          referenceCompositionEnabled: boolean;
          effectiveFresnelOverride?: 0;
        };
      },
      mode: number
    ) => {
      state.opticsCalibrationReadback.mode = mode === 1 || mode === 2 ? mode : 0;
      state.opticsCalibrationReadback.referenceCompositionEnabled = mode === 1 || mode === 2;
      state.opticsCalibrationReadback.effectiveFresnelOverride = mode === 2 ? 0 : undefined;
      return state.opticsCalibrationReadback;
    }
  ),
  setHeightfieldWaterOpticalProfile: vi.fn(),
  setHeightfieldWaterReflectionBinding: vi.fn(
    (
      state: { quality: string },
      binding?: { requestedSource: string; resolvedSource: string; planarTexture?: { width: number; height: number } },
      settings: { distortionStrength: number; highFilterSampleCount: number } = {
        distortionStrength: 0.025,
        highFilterSampleCount: 1
      }
    ) => ({
      ...settings,
      quality: state.quality,
      requestedSource: binding?.requestedSource ?? "sky",
      bindingResolvedSource: binding?.resolvedSource ?? "sky",
      effectiveSource: binding?.resolvedSource ?? "sky",
      textureWidth: binding?.planarTexture?.width ?? 0,
      textureHeight: binding?.planarTexture?.height ?? 0,
      filterSampleCount:
        binding?.resolvedSource === "planar" && state.quality === "high" && settings.highFilterSampleCount === 5 ? 5 : 1
    })
  ),
  setHeightfieldWaterRefractionEnabled: vi.fn(),
  setHeightfieldWaterSurfaceOpticsBinding: vi.fn(
    (
      state: {
        quality: string;
        heightfieldReflectionReadback: Record<string, unknown>;
        surfaceOpticsReadback: Record<string, unknown>;
      },
      binding: {
        tier: "medium" | "high" | "experimental";
        opticalProfile: unknown;
        refractionEnabled: boolean;
        reflection?: {
          requestedSource: string;
          resolvedSource: string;
          planarTexture?: { width: number; height: number };
        };
        reflectionSampling?: { distortionStrength?: number; highFilterSampleCount?: number };
        debugView: number;
      }
    ) => {
      const reflection = binding.reflection;
      const sampling = binding.reflectionSampling;
      const effectiveSource = reflection?.resolvedSource ?? "sky";
      const filterSampleCount =
        effectiveSource === "planar" && state.quality === "high" && sampling?.highFilterSampleCount === 5 ? 5 : 1;
      Object.assign(state.heightfieldReflectionReadback, {
        effectiveSource,
        textureWidth: reflection?.planarTexture?.width ?? 0,
        textureHeight: reflection?.planarTexture?.height ?? 0,
        distortionStrength: sampling?.distortionStrength ?? 0.025,
        filterSampleCount
      });
      Object.assign(state.surfaceOpticsReadback, {
        requestedTier: binding.tier,
        resolvedTier: binding.tier === "medium" ? "medium" : "high",
        tierFallbackReason: binding.tier === "experimental" ? "water-optics-experimental-resolved-high" : undefined,
        opticalProfile: binding.opticalProfile,
        refractionEnabled: binding.refractionEnabled,
        effectiveSource,
        filterSampleCount,
        debugView: binding.debugView
      });
      return state.surfaceOpticsReadback;
    }
  ),
  setHeightfieldWaterSurfaceAppearanceBinding: vi.fn(
    (
      state: {
        quality: string;
        surfaceAppearanceReadback: Record<string, unknown>;
      },
      binding?: {
        appearance: {
          sourceId: string;
          appearanceHash: string;
          variantKey: string;
          normal: {
            textureAssetId: string;
            textureContentHash: string;
            tiling: number;
            scrollUvPerSecond: number;
            strength: number;
            flipGreen: boolean;
          };
          depthTint: {
            model: string;
            color?: readonly [number, number, number, number];
            distance?: number;
            exponent?: number;
          };
          coastalAlpha: {
            model: string;
            distance?: number;
          };
          contactFoam: {
            model: string;
            worldScale?: number;
            timeRate?: number;
            opacity?: number;
            contactDistance?: number;
            octaves?: {
              count: 1 | 2 | 3;
              weights: readonly number[];
            };
            lacunarity?: number;
            suppressRefraction?: number;
            smoothnessReduction?: number;
          };
        };
        assetId: string;
        contentHash: string;
        texture: { width: number; height: number; destroyed: boolean };
        ownership: string;
      }
    ) => {
      const active =
        state.quality !== "low" &&
        binding?.assetId === binding?.appearance.normal.textureAssetId &&
        binding?.contentHash === binding?.appearance.normal.textureContentHash &&
        binding?.ownership === "borrowed" &&
        binding?.texture.destroyed === false;
      const depthTintEnabled = active && binding?.appearance.depthTint.model === "scene-depth-power";
      const coastalAlphaEnabled = active && binding?.appearance.coastalAlpha.model === "scene-depth";
      const contactFoamEnabled = active && binding?.appearance.contactFoam.model === "scene-depth-voronoi";
      Object.assign(state.surfaceAppearanceReadback, {
        requested: binding !== undefined,
        active,
        appearanceAssetId: binding?.appearance.sourceId,
        appearanceHash: binding?.appearance.appearanceHash,
        variantKey: binding?.appearance.variantKey,
        normalAssetId: binding?.assetId,
        normalContentHash: binding?.contentHash,
        normalTextureWidth: active ? binding?.texture.width : 0,
        normalTextureHeight: active ? binding?.texture.height : 0,
        normalLayerCount: active ? 2 : 0,
        normalTiling: active ? binding?.appearance.normal.tiling : 0,
        normalScrollUvPerSecond: active ? binding?.appearance.normal.scrollUvPerSecond : 0,
        normalStrength: active ? binding?.appearance.normal.strength : 0,
        flipGreen: active ? binding?.appearance.normal.flipGreen : false,
        depthTintModel: active ? binding?.appearance.depthTint.model : undefined,
        depthTintEnabled,
        depthTintColor: depthTintEnabled ? binding?.appearance.depthTint.color : undefined,
        depthTintDistance: depthTintEnabled ? binding?.appearance.depthTint.distance : 0,
        depthTintExponent: depthTintEnabled ? binding?.appearance.depthTint.exponent : 0,
        coastalAlphaModel: active ? binding?.appearance.coastalAlpha.model : undefined,
        coastalAlphaEnabled,
        coastalAlphaDistance: coastalAlphaEnabled ? binding?.appearance.coastalAlpha.distance : 0,
        contactFoamModel: active ? binding?.appearance.contactFoam.model : undefined,
        contactFoamEnabled,
        contactFoamWorldScale: contactFoamEnabled ? binding?.appearance.contactFoam.worldScale : 0,
        contactFoamTimeRate: contactFoamEnabled ? binding?.appearance.contactFoam.timeRate : 0,
        contactFoamOpacity: contactFoamEnabled ? binding?.appearance.contactFoam.opacity : 0,
        contactFoamContactDistance: contactFoamEnabled ? binding?.appearance.contactFoam.contactDistance : 0,
        contactFoamOctaveCount: contactFoamEnabled ? binding?.appearance.contactFoam.octaves?.count : 0,
        contactFoamWeights: contactFoamEnabled ? binding?.appearance.contactFoam.octaves?.weights : [],
        contactFoamLacunarity: contactFoamEnabled ? binding?.appearance.contactFoam.lacunarity : 0,
        contactFoamSuppressRefraction: contactFoamEnabled ? binding?.appearance.contactFoam.suppressRefraction : 0,
        contactFoamSmoothnessReduction: contactFoamEnabled ? binding?.appearance.contactFoam.smoothnessReduction : 0,
        ownership: binding?.ownership === "borrowed" ? "borrowed" : undefined,
        fallbackReason:
          binding === undefined
            ? undefined
            : state.quality === "low"
              ? "surface-appearance-quality-unsupported"
              : active
                ? undefined
                : "surface-appearance-asset-id-mismatch"
      });
      return state.surfaceAppearanceReadback;
    }
  ),
  setHeightfieldWaterSurfaceTimeOverride: vi.fn()
}));

vi.mock("../../runtime/heightfield/HeightfieldWaterMeshUploader", () => ({
  uploadHeightfieldWaterMesh: runtimeMocks.uploadHeightfieldWaterMesh
}));
vi.mock("../../runtime/heightfield/HeightfieldWaterLocalMapTextureFactory", () => ({
  createHeightfieldWaterLocalMapTexture: runtimeMocks.createHeightfieldWaterLocalMapTexture
}));
vi.mock("../../runtime/heightfield/HeightfieldWaterMaterialFactory", () => ({
  createHeightfieldWaterMaterial: runtimeMocks.createHeightfieldWaterMaterial,
  updateHeightfieldWaterMaterial: runtimeMocks.updateHeightfieldWaterMaterial,
  setHeightfieldWaterCompositionMode: runtimeMocks.setHeightfieldWaterCompositionMode,
  setHeightfieldWaterDebugMode: runtimeMocks.setHeightfieldWaterDebugMode,
  setHeightfieldWaterDepthWriteEnabled: runtimeMocks.setHeightfieldWaterDepthWriteEnabled,
  setHeightfieldWaterFeatureFlags: runtimeMocks.setHeightfieldWaterFeatureFlags,
  setHeightfieldWaterLocalFoamMask: runtimeMocks.setHeightfieldWaterLocalFoamMask,
  setHeightfieldWaterOpticsCalibrationMode: runtimeMocks.setHeightfieldWaterOpticsCalibrationMode,
  setHeightfieldWaterOpticalProfile: runtimeMocks.setHeightfieldWaterOpticalProfile,
  setHeightfieldWaterReflectionBinding: runtimeMocks.setHeightfieldWaterReflectionBinding,
  setHeightfieldWaterRefractionEnabled: runtimeMocks.setHeightfieldWaterRefractionEnabled,
  setHeightfieldWaterSurfaceAppearanceBinding: runtimeMocks.setHeightfieldWaterSurfaceAppearanceBinding,
  setHeightfieldWaterSurfaceAppearanceFeatureFlags: runtimeMocks.setHeightfieldWaterSurfaceAppearanceFeatureFlags,
  setHeightfieldWaterSurfaceOpticsBinding: runtimeMocks.setHeightfieldWaterSurfaceOpticsBinding,
  setHeightfieldWaterSurfaceTimeOverride: runtimeMocks.setHeightfieldWaterSurfaceTimeOverride
}));

import type { Engine, Entity, Texture2D } from "@galacean/engine-core";
import { WaterQualityTier } from "../../authoring/wave/enums/WaterQualityTier";
import { HeightfieldWaterCompiler } from "../../compiler/heightfield/HeightfieldWaterCompiler";
import { WaterSurfaceAppearanceCompiler } from "../../compiler/surface/WaterSurfaceAppearanceCompiler";
import { createHeightfieldWaterFixture } from "../../demo/heightfield/heightfieldFixture";
import { HeightfieldWaterResource } from "../../runtime/heightfield/HeightfieldWaterResource";
import {
  HeightfieldWaterRuntimeController,
  HeightfieldWaterRuntimeSubmissionCancelledError
} from "../../runtime/heightfield/HeightfieldWaterRuntimeController";
import {
  HeightfieldWaterCompositionMode,
  HeightfieldWaterDebugMode,
  HeightfieldWaterOpticsCalibrationMode
} from "../../runtime/heightfield/HeightfieldWaterRuntimeEnums";
import { DEFAULT_WATER_OPTICAL_PROFILE, type WaterOpticalProfile } from "../../runtime/optics/WaterOpticalProfile";
import { grasslandsSurfaceAppearanceFixture } from "../fixtures/waterSurfaceAppearanceFixtures";

class FakeRenderer {
  mesh?: unknown;
  priority = 0;
  readonly entity: FakeEntity;
  readonly shaderData = { setVector4: vi.fn() };
  readonly setMaterial = vi.fn();

  constructor(entity: FakeEntity) {
    this.entity = entity;
  }
}

class FakeEntity {
  layer = 0;
  isActive = true;
  destroyed = false;
  readonly children: FakeEntity[] = [];
  readonly renderers: FakeRenderer[] = [];
  readonly transform = { setPosition: vi.fn() };

  constructor(readonly name: string) {}

  createChild(name: string): FakeEntity {
    const child = new FakeEntity(name);
    this.children.push(child);
    return child;
  }

  addComponent(): FakeRenderer {
    const renderer = new FakeRenderer(this);
    this.renderers.push(renderer);
    return renderer;
  }

  destroy(): void {
    this.destroyed = true;
  }
}

function createRuntime(): {
  readonly controller: HeightfieldWaterRuntimeController;
  readonly root: FakeEntity;
  readonly gc: ReturnType<typeof vi.fn>;
} {
  const root = new FakeEntity("root");
  root.layer = 30;
  const gc = vi.fn();
  const engine = { resourceManager: { gc } } as unknown as Engine;
  return {
    controller: new HeightfieldWaterRuntimeController(engine, root as unknown as Entity),
    root,
    gc
  };
}

function compileResource(quality: WaterQualityTier): HeightfieldWaterResource {
  return HeightfieldWaterResource.create(
    HeightfieldWaterCompiler.compile(createHeightfieldWaterFixture(quality).descriptor).data!
  );
}

function createAppearanceBinding(texture: Texture2D) {
  return {
    appearance: WaterSurfaceAppearanceCompiler.compile(grasslandsSurfaceAppearanceFixture).data!,
    assetId: grasslandsSurfaceAppearanceFixture.normal.textureAssetId,
    contentHash: grasslandsSurfaceAppearanceFixture.normal.textureContentHash,
    texture,
    ownership: "borrowed" as const
  };
}

describe("HeightfieldWaterRuntimeController", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uploads in budgeted slices under a hidden root and exposes no per-frame upload path", async () => {
    const { controller, root } = createRuntime();
    const resource = compileResource(WaterQualityTier.Medium);
    let time = 0;
    const yieldToMainThread = vi.fn(async () => undefined);

    const activation = await controller.replaceActiveIncremental("fixture", resource, {
      frameBudgetMs: 4,
      now: () => (time += 5),
      yieldToMainThread
    });

    expect(root.children[0].isActive).toBe(true);
    expect(root.children[0].layer).toBe(root.layer);
    expect(root.children[0].children.every((chunk) => chunk.layer === root.layer)).toBe(true);
    expect(activation.submittedChunkCount).toBe(resource.data.chunks.length);
    expect(activation.meshUploadCount).toBe(resource.data.chunks.length);
    expect(activation.yieldCount).toBe(resource.data.chunks.length - 1);
    expect(yieldToMainThread).toHaveBeenCalledTimes(activation.yieldCount);
    expect(controller.meshUploadCount).toBe(resource.data.chunks.length);
    expect(controller.activeChunkCount).toBe(resource.data.chunks.length);
    expect(resource.referenceCount).toBe(1);
    expect(controller.resourceMetrics).toEqual({
      retainedRuntimeSetCount: 1,
      activeRuntimeSetCount: 1,
      activeDrawCount: resource.data.chunks.length,
      retainedMaterialCount: 1,
      retainedLocalMapTextureCount: 1,
      runtimeSetCreateCount: 1,
      runtimeSetDestroyCount: 0,
      materialCreateCount: 1,
      materialDestroyCount: 0,
      localMapTextureCreateCount: 1,
      localMapTextureDestroyCount: 0,
      meshCreateCount: resource.data.chunks.length,
      meshDestroyCount: 0
    });

    const uploadCount = controller.meshUploadCount;
    controller.setDebugMode(HeightfieldWaterDebugMode.EffectiveRoughness);
    controller.setRefractionEnabled(false);
    controller.setCompositionMode(HeightfieldWaterCompositionMode.PrecomposedReplace);
    controller.setDepthWriteEnabled(true);
    controller.setFeatureFlags({ waves: false, microNormals: true, foam: false });
    controller.setSurfaceAppearanceFeatureFlags({
      externalNormal: false,
      depthTint: true,
      coastalAlpha: false,
      contactFoam: true,
      directSpecular: false
    });
    controller.setSurfaceTimeOverride(86400);
    expect(controller.surfaceTimeOverride).toBe(86400);
    controller.setOpticalProfile(DEFAULT_WATER_OPTICAL_PROFILE);
    controller.updateMaterial(resource.data.material);
    expect(controller.meshUploadCount).toBe(uploadCount);
    expect(runtimeMocks.uploadHeightfieldWaterMesh).toHaveBeenCalledTimes(uploadCount);
    expect(runtimeMocks.createHeightfieldWaterMaterial).toHaveBeenCalledTimes(1);
    expect(runtimeMocks.setHeightfieldWaterSurfaceOpticsBinding).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({
        debugView: HeightfieldWaterDebugMode.EffectiveRoughness
      })
    );

    controller.destroy();
    expect(resource.referenceCount).toBe(0);
    expect(controller.resourceMetrics).toEqual({
      retainedRuntimeSetCount: 0,
      activeRuntimeSetCount: 0,
      activeDrawCount: 0,
      retainedMaterialCount: 0,
      retainedLocalMapTextureCount: 0,
      runtimeSetCreateCount: 1,
      runtimeSetDestroyCount: 1,
      materialCreateCount: 1,
      materialDestroyCount: 1,
      localMapTextureCreateCount: 1,
      localMapTextureDestroyCount: 1,
      meshCreateCount: resource.data.chunks.length,
      meshDestroyCount: resource.data.chunks.length
    });
  });

  it("copies and freezes default or caller Surface Appearance feature requests for active and future sets", async () => {
    const { controller } = createRuntime();
    const resource = compileResource(WaterQualityTier.High);
    const defaults = controller.surfaceAppearanceFeatureFlags;
    expect(defaults).toEqual({
      externalNormal: true,
      depthTint: true,
      coastalAlpha: true,
      contactFoam: true,
      directSpecular: true
    });
    expect(Object.isFrozen(defaults)).toBe(true);
    expect(controller.surfaceAppearanceFeatureFlags).toBe(defaults);

    const callerFlags = {
      externalNormal: false,
      depthTint: true,
      coastalAlpha: false,
      contactFoam: true,
      directSpecular: false
    };
    controller.setSurfaceAppearanceFeatureFlags(callerFlags);
    const snapshot = controller.surfaceAppearanceFeatureFlags;
    expect(snapshot).not.toBe(callerFlags);
    expect(snapshot).toEqual(callerFlags);
    expect(Object.isFrozen(snapshot)).toBe(true);
    callerFlags.externalNormal = true;
    callerFlags.directSpecular = true;
    expect(controller.surfaceAppearanceFeatureFlags).toEqual({
      externalNormal: false,
      depthTint: true,
      coastalAlpha: false,
      contactFoam: true,
      directSpecular: false
    });
    expect(runtimeMocks.setHeightfieldWaterSurfaceAppearanceFeatureFlags).not.toHaveBeenCalled();

    await controller.replaceActiveIncremental("fixture", resource, { now: () => 0 });
    const material = runtimeMocks.createHeightfieldWaterMaterial.mock.results[0].value;
    expect(runtimeMocks.setHeightfieldWaterSurfaceAppearanceFeatureFlags).toHaveBeenLastCalledWith(material, snapshot);
    expect(material.surfaceAppearanceFeatureFlags).toEqual(snapshot);

    controller.destroy();
    expect(controller.surfaceAppearanceFeatureFlags).toBe(snapshot);
    expect(() => controller.setSurfaceAppearanceFeatureFlags(defaults)).toThrow(
      "Heightfield water runtime controller has been destroyed."
    );
  });

  it("replays feature toggles that occur while a future Appearance set is yielding", async () => {
    const { controller } = createRuntime();
    const resource = compileResource(WaterQualityTier.High);
    const texture = {
      width: 1024,
      height: 1024,
      destroyed: false,
      destroy: vi.fn()
    } as unknown as Texture2D;
    controller.setSurfaceAppearanceBinding(createAppearanceBinding(texture));
    controller.setSurfaceAppearanceFeatureFlags({
      externalNormal: true,
      depthTint: false,
      coastalAlpha: true,
      contactFoam: false,
      directSpecular: true
    });
    let time = 0;
    let toggled = false;

    await controller.replaceActiveIncremental("fixture", resource, {
      frameBudgetMs: 0,
      now: () => ++time,
      yieldToMainThread: async () => {
        if (toggled) return;
        toggled = true;
        controller.setSurfaceAppearanceFeatureFlags({
          externalNormal: false,
          depthTint: true,
          coastalAlpha: false,
          contactFoam: true,
          directSpecular: false
        });
      }
    });

    const material = runtimeMocks.createHeightfieldWaterMaterial.mock.results[0].value;
    expect(runtimeMocks.setHeightfieldWaterSurfaceAppearanceFeatureFlags).toHaveBeenLastCalledWith(
      material,
      controller.surfaceAppearanceFeatureFlags
    );
    expect(material.surfaceAppearanceFeatureFlags).toEqual(controller.surfaceAppearanceFeatureFlags);
    expect(controller.surfaceAppearanceFeatureFlags).toEqual({
      externalNormal: false,
      depthTint: true,
      coastalAlpha: false,
      contactFoam: true,
      directSpecular: false
    });
    expect(texture.destroy).not.toHaveBeenCalled();
    controller.destroy();
    expect(texture.destroy).not.toHaveBeenCalled();
  });

  it("replays optical profile, refraction, and Debug changes that occur while a future set is yielding", async () => {
    const { controller } = createRuntime();
    const resource = compileResource(WaterQualityTier.High);
    const updatedProfile = Object.freeze({
      ...DEFAULT_WATER_OPTICAL_PROFILE,
      refractionStrength: 0.07,
      reflectionIntensity: 0.25
    });
    let time = 0;
    let toggled = false;

    await controller.replaceActiveIncremental("fixture", resource, {
      frameBudgetMs: 0,
      now: () => ++time,
      yieldToMainThread: async () => {
        if (toggled) return;
        toggled = true;
        controller.setOpticalProfile(updatedProfile);
        controller.setRefractionEnabled(false);
        controller.setDebugMode(HeightfieldWaterDebugMode.EffectiveRoughness);
      }
    });

    const material = runtimeMocks.createHeightfieldWaterMaterial.mock.results[0].value;
    expect(runtimeMocks.setHeightfieldWaterSurfaceOpticsBinding).toHaveBeenLastCalledWith(
      material,
      expect.objectContaining({
        opticalProfile: updatedProfile,
        refractionEnabled: false,
        debugView: HeightfieldWaterDebugMode.EffectiveRoughness
      })
    );
    expect(controller.activeSurfaceOpticsReadback).toMatchObject({
      opticalProfile: updatedProfile,
      refractionEnabled: false,
      debugView: HeightfieldWaterDebugMode.EffectiveRoughness
    });

    controller.destroy();
  });

  it("retains one borrowed appearance for future and active sets, detaches all, and never destroys the texture", async () => {
    const { controller } = createRuntime();
    const firstResource = compileResource(WaterQualityTier.High);
    const secondResource = compileResource(WaterQualityTier.High);
    const texture = {
      width: 1024,
      height: 1024,
      destroyed: false,
      destroy: vi.fn()
    } as unknown as Texture2D;
    const binding = createAppearanceBinding(texture);
    controller.setSurfaceAppearanceFeatureFlags({
      externalNormal: false,
      depthTint: true,
      coastalAlpha: false,
      contactFoam: true,
      directSpecular: false
    });

    controller.setSurfaceAppearanceBinding(binding);
    expect(controller.surfaceAppearanceBinding).toBe(binding);
    expect(controller.activeSurfaceAppearanceReadback).toBeUndefined();
    expect(runtimeMocks.setHeightfieldWaterSurfaceAppearanceBinding).not.toHaveBeenCalled();

    await controller.replaceActiveIncremental("first", firstResource, { now: () => 0 });
    const firstMaterial = runtimeMocks.createHeightfieldWaterMaterial.mock.results[0].value;
    const stableReadback = controller.activeSurfaceAppearanceReadback;
    expect(runtimeMocks.setHeightfieldWaterSurfaceAppearanceBinding).toHaveBeenCalledWith(firstMaterial, binding);
    expect(stableReadback).toBe(firstMaterial.surfaceAppearanceReadback);
    expect(stableReadback).toMatchObject({
      active: true,
      normalLayerCount: 2,
      normalTextureWidth: 1024,
      depthTintEnabled: true,
      depthTintDistance: 10,
      depthTintExponent: 0.5,
      coastalAlphaEnabled: true,
      coastalAlphaDistance: 0.5,
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
      ownership: "borrowed"
    });

    await controller.replaceActiveIncremental("second", secondResource, { now: () => 0 });
    const secondMaterial = runtimeMocks.createHeightfieldWaterMaterial.mock.results[1].value;
    expect(runtimeMocks.setHeightfieldWaterSurfaceAppearanceBinding).toHaveBeenCalledWith(secondMaterial, binding);
    controller.setSurfaceAppearanceBinding();
    expect(controller.surfaceAppearanceBinding).toBeUndefined();
    expect(runtimeMocks.setHeightfieldWaterSurfaceAppearanceBinding).toHaveBeenLastCalledWith(
      secondMaterial,
      undefined
    );
    expect(runtimeMocks.setHeightfieldWaterSurfaceAppearanceBinding).toHaveBeenCalledWith(firstMaterial, undefined);
    expect(controller.activeSurfaceAppearanceReadback).toMatchObject({
      requested: false,
      active: false,
      normalLayerCount: 0,
      depthTintEnabled: false,
      coastalAlphaEnabled: false,
      contactFoamEnabled: false,
      contactFoamOctaveCount: 0,
      contactFoamWeights: []
    });
    expect(texture.destroy).not.toHaveBeenCalled();

    controller.destroy();
    expect(controller.surfaceAppearanceBinding).toBeUndefined();
    expect(texture.destroy).not.toHaveBeenCalled();
  });

  it("replays a binding replacement and detach that occur while a future set is yielding", async () => {
    const { controller } = createRuntime();
    const firstResource = compileResource(WaterQualityTier.High);
    const secondResource = compileResource(WaterQualityTier.High);
    const firstTexture = {
      width: 1024,
      height: 1024,
      destroyed: false,
      destroy: vi.fn()
    } as unknown as Texture2D;
    const replacementTexture = {
      width: 1024,
      height: 1024,
      destroyed: false,
      destroy: vi.fn()
    } as unknown as Texture2D;
    const initialBinding = createAppearanceBinding(firstTexture);
    const replacementBinding = createAppearanceBinding(replacementTexture);
    let time = 0;
    let replaced = false;

    controller.setSurfaceAppearanceBinding(initialBinding);
    await controller.replaceActiveIncremental("first", firstResource, {
      frameBudgetMs: 0,
      now: () => ++time,
      yieldToMainThread: async () => {
        if (replaced) return;
        replaced = true;
        controller.setSurfaceAppearanceBinding(replacementBinding);
      }
    });

    const firstMaterial = runtimeMocks.createHeightfieldWaterMaterial.mock.results[0].value;
    expect(runtimeMocks.setHeightfieldWaterSurfaceAppearanceBinding).toHaveBeenCalledWith(
      firstMaterial,
      initialBinding
    );
    expect(runtimeMocks.setHeightfieldWaterSurfaceAppearanceBinding).toHaveBeenLastCalledWith(
      firstMaterial,
      replacementBinding
    );
    expect(controller.surfaceAppearanceBinding).toBe(replacementBinding);
    expect(controller.activeSurfaceAppearanceReadback).toMatchObject({ active: true });

    let detached = false;
    await controller.replaceActiveIncremental("second", secondResource, {
      frameBudgetMs: 0,
      now: () => ++time,
      yieldToMainThread: async () => {
        if (detached) return;
        detached = true;
        controller.setSurfaceAppearanceBinding();
      }
    });

    const secondMaterial = runtimeMocks.createHeightfieldWaterMaterial.mock.results[1].value;
    expect(runtimeMocks.setHeightfieldWaterSurfaceAppearanceBinding).toHaveBeenCalledWith(
      secondMaterial,
      replacementBinding
    );
    expect(runtimeMocks.setHeightfieldWaterSurfaceAppearanceBinding).toHaveBeenLastCalledWith(
      secondMaterial,
      undefined
    );
    expect(controller.surfaceAppearanceBinding).toBeUndefined();
    expect(controller.activeSurfaceAppearanceReadback).toMatchObject({
      requested: false,
      active: false,
      normalLayerCount: 0
    });
    expect(firstTexture.destroy).not.toHaveBeenCalled();
    expect(replacementTexture.destroy).not.toHaveBeenCalled();
    controller.destroy();
  });

  it("reports Low fallback and activates the same cached binding on a future High set", async () => {
    const { controller } = createRuntime();
    const lowResource = compileResource(WaterQualityTier.Low);
    const highResource = compileResource(WaterQualityTier.High);
    const texture = {
      width: 1024,
      height: 1024,
      destroyed: false,
      destroy: vi.fn()
    } as unknown as Texture2D;
    const binding = createAppearanceBinding(texture);

    controller.setSurfaceAppearanceBinding(binding);
    await controller.replaceActiveIncremental("low", lowResource, { now: () => 0 });
    expect(controller.activeSurfaceAppearanceReadback).toMatchObject({
      requested: true,
      active: false,
      fallbackReason: "surface-appearance-quality-unsupported"
    });

    await controller.replaceActiveIncremental("high", highResource, { now: () => 0 });
    expect(controller.activeSurfaceAppearanceReadback).toMatchObject({
      requested: true,
      active: true,
      normalLayerCount: 2
    });
    expect(controller.surfaceAppearanceBinding).toBe(binding);
    const highMaterial = runtimeMocks.createHeightfieldWaterMaterial.mock.results[1].value;
    expect(runtimeMocks.setHeightfieldWaterSurfaceAppearanceFeatureFlags).toHaveBeenLastCalledWith(
      highMaterial,
      controller.surfaceAppearanceFeatureFlags
    );
    expect(highMaterial.surfaceAppearanceFeatureFlags).toEqual(controller.surfaceAppearanceFeatureFlags);
    expect(texture.destroy).not.toHaveBeenCalled();
    controller.destroy();
    expect(texture.destroy).not.toHaveBeenCalled();
  });

  it("cannot retain a new caller texture after the controller is destroyed", () => {
    const { controller } = createRuntime();
    const texture = {
      width: 1024,
      height: 1024,
      destroyed: false,
      destroy: vi.fn()
    } as unknown as Texture2D;
    const binding = createAppearanceBinding(texture);

    controller.setSurfaceAppearanceBinding(binding);
    controller.destroy();
    expect(controller.surfaceAppearanceBinding).toBeUndefined();
    expect(() => controller.setSurfaceAppearanceBinding(binding)).toThrow(
      "Heightfield water runtime controller has been destroyed."
    );
    expect(controller.surfaceAppearanceBinding).toBeUndefined();
    expect(texture.destroy).not.toHaveBeenCalled();
  });

  it("retains independent refraction, composition, depth-write, and renderer-priority controls across activation", async () => {
    const { controller, root } = createRuntime();
    const resource = compileResource(WaterQualityTier.Medium);
    controller.setRefractionEnabled(false);
    controller.setCompositionMode(HeightfieldWaterCompositionMode.PrecomposedReplace);
    controller.setDepthWriteEnabled(true);
    controller.setRenderPriority(-100);

    expect(controller.refractionEnabled).toBe(false);
    expect(controller.compositionMode).toBe(HeightfieldWaterCompositionMode.PrecomposedReplace);
    expect(controller.depthWriteEnabled).toBe(true);
    expect(controller.renderPriority).toBe(-100);
    expect(controller.activeRenderPriority).toBeUndefined();
    expect(runtimeMocks.setHeightfieldWaterSurfaceOpticsBinding).not.toHaveBeenCalled();
    expect(runtimeMocks.setHeightfieldWaterCompositionMode).not.toHaveBeenCalled();
    expect(runtimeMocks.setHeightfieldWaterDepthWriteEnabled).not.toHaveBeenCalled();

    await controller.replaceActiveIncremental("fixture", resource, { now: () => 0 });
    const materialState = runtimeMocks.createHeightfieldWaterMaterial.mock.results[0].value;
    expect(runtimeMocks.setHeightfieldWaterSurfaceOpticsBinding).toHaveBeenCalledWith(
      materialState,
      expect.objectContaining({ refractionEnabled: false })
    );
    expect(runtimeMocks.setHeightfieldWaterCompositionMode).toHaveBeenCalledWith(
      materialState,
      HeightfieldWaterCompositionMode.PrecomposedReplace
    );
    expect(runtimeMocks.setHeightfieldWaterDepthWriteEnabled).toHaveBeenCalledWith(materialState, true);
    expect(root.children[0].renderers).toHaveLength(0);
    expect(root.children[0].children.every((chunk) => chunk.renderers[0].priority === -100)).toBe(true);
    expect(controller.activeRenderPriority).toBe(-100);

    controller.setRefractionEnabled(true);
    controller.setCompositionMode(HeightfieldWaterCompositionMode.LegacyAlpha);
    controller.setDepthWriteEnabled(false);
    controller.setRenderPriority(7);
    expect(runtimeMocks.setHeightfieldWaterSurfaceOpticsBinding).toHaveBeenLastCalledWith(
      materialState,
      expect.objectContaining({ refractionEnabled: true })
    );
    expect(runtimeMocks.setHeightfieldWaterCompositionMode).toHaveBeenLastCalledWith(
      materialState,
      HeightfieldWaterCompositionMode.LegacyAlpha
    );
    expect(runtimeMocks.setHeightfieldWaterDepthWriteEnabled).toHaveBeenLastCalledWith(materialState, false);
    expect(root.children[0].children.every((chunk) => chunk.renderers[0].priority === 7)).toBe(true);
    expect(controller.activeRenderPriority).toBe(7);
    expect(() => controller.setRenderPriority(Number.NaN)).toThrowError(
      "Heightfield water render priority must be finite."
    );

    controller.destroy();
  });

  it("retains and reapplies one validated local foam mask across activation", async () => {
    const { controller } = createRuntime();
    const resource = compileResource(WaterQualityTier.Medium);
    const mask = {
      enabled: true,
      centerXZ: [-6, 1.5] as const,
      halfSizeXZ: [3.25, 4.25] as const,
      featherMeters: 0.45
    };

    controller.setLocalFoamMask(mask);
    expect(controller.localFoamMask).toEqual(mask);
    expect(Object.isFrozen(controller.localFoamMask)).toBe(true);
    expect(runtimeMocks.setHeightfieldWaterLocalFoamMask).not.toHaveBeenCalled();

    await controller.replaceActiveIncremental("fixture", resource, { now: () => 0 });
    const materialState = runtimeMocks.createHeightfieldWaterMaterial.mock.results[0].value;
    expect(runtimeMocks.setHeightfieldWaterLocalFoamMask).toHaveBeenCalledWith(materialState, mask);

    controller.setLocalFoamMask({ ...mask, enabled: false });
    expect(runtimeMocks.setHeightfieldWaterLocalFoamMask).toHaveBeenLastCalledWith(
      materialState,
      expect.objectContaining({ enabled: false })
    );
    expect(() => controller.setLocalFoamMask({ ...mask, featherMeters: Number.NaN })).toThrow("finite");
    controller.destroy();
  });

  it("retains the calibration mode and exposes the active stable readback", async () => {
    const { controller } = createRuntime();
    const resource = compileResource(WaterQualityTier.High);
    controller.setOpticsCalibrationMode(HeightfieldWaterOpticsCalibrationMode.PureTransmission);

    expect(runtimeMocks.setHeightfieldWaterOpticsCalibrationMode).not.toHaveBeenCalled();
    expect(controller.activeOpticsCalibrationReadback).toBeUndefined();
    await controller.replaceActiveIncremental("fixture", resource, { now: () => 0 });
    const materialState = runtimeMocks.createHeightfieldWaterMaterial.mock.results[0].value;
    expect(runtimeMocks.setHeightfieldWaterOpticsCalibrationMode).toHaveBeenCalledWith(
      materialState,
      HeightfieldWaterOpticsCalibrationMode.PureTransmission
    );
    expect(controller.activeOpticsCalibrationReadback).toBe(materialState.opticsCalibrationReadback);
    expect(controller.activeOpticsCalibrationReadback).toEqual({
      mode: HeightfieldWaterOpticsCalibrationMode.PureTransmission,
      referenceCompositionEnabled: true,
      effectiveFresnelOverride: 0
    });

    controller.setOpticsCalibrationMode(HeightfieldWaterOpticsCalibrationMode.CpuReference);
    expect(runtimeMocks.setHeightfieldWaterOpticsCalibrationMode).toHaveBeenLastCalledWith(
      materialState,
      HeightfieldWaterOpticsCalibrationMode.CpuReference
    );
    expect(controller.activeOpticsCalibrationReadback).toEqual({
      mode: HeightfieldWaterOpticsCalibrationMode.CpuReference,
      referenceCompositionEnabled: true,
      effectiveFresnelOverride: undefined
    });

    controller.destroy();
  });

  it("retains one profile reference and applies it before and after activation", async () => {
    const { controller } = createRuntime();
    const resource = compileResource(WaterQualityTier.Medium);
    const initialProfile: WaterOpticalProfile = {
      ...DEFAULT_WATER_OPTICAL_PROFILE,
      absorptionCoefficient: [0.18, 0.07, 0.03],
      indexOfRefraction: 1.333
    };
    controller.setOpticalProfile(initialProfile);

    expect(controller.opticalProfile).toBe(initialProfile);
    expect(runtimeMocks.setHeightfieldWaterSurfaceOpticsBinding).not.toHaveBeenCalled();
    await controller.replaceActiveIncremental("fixture", resource, { now: () => 0 });
    const materialState = runtimeMocks.createHeightfieldWaterMaterial.mock.results[0].value;
    expect(runtimeMocks.setHeightfieldWaterSurfaceOpticsBinding).toHaveBeenCalledWith(
      materialState,
      expect.objectContaining({ opticalProfile: initialProfile })
    );

    const updatedProfile: WaterOpticalProfile = {
      ...initialProfile,
      roughness: 0.35,
      reflectionIntensity: 0.8
    };
    controller.setOpticalProfile(updatedProfile);
    expect(controller.opticalProfile).toBe(updatedProfile);
    expect(runtimeMocks.setHeightfieldWaterSurfaceOpticsBinding).toHaveBeenLastCalledWith(
      materialState,
      expect.objectContaining({ opticalProfile: updatedProfile })
    );

    controller.destroy();
  });

  it("retains reflection binding/settings, resolves High filter readback, and clears stale bindings", async () => {
    const { controller } = createRuntime();
    const resource = compileResource(WaterQualityTier.High);
    const binding = {
      requestedSource: "planar" as const,
      resolvedSource: "planar" as const,
      planarTexture: { width: 640, height: 360 },
      planarViewProjection: { elements: new Float32Array(16) }
    };
    controller.setReflectionSamplingConfig({ distortionStrength: 0.04, edgeFadeTexels: 10, highFilterSampleCount: 5 });
    controller.setReflectionBinding(binding as never);

    expect(controller.reflectionBinding).toBe(binding);
    expect(controller.reflectionSamplingSettings).toMatchObject({
      distortionStrength: 0.04,
      edgeFadeTexels: 10,
      highFilterSampleCount: 5
    });
    expect(runtimeMocks.setHeightfieldWaterSurfaceOpticsBinding).not.toHaveBeenCalled();

    await controller.replaceActiveIncremental("fixture", resource, { now: () => 0 });
    const materialState = runtimeMocks.createHeightfieldWaterMaterial.mock.results[0].value;
    expect(runtimeMocks.setHeightfieldWaterSurfaceOpticsBinding).toHaveBeenCalledWith(
      materialState,
      expect.objectContaining({
        reflection: binding,
        reflectionSampling: controller.reflectionSamplingSettings
      })
    );
    expect(controller.activeReflectionSampling).toMatchObject({
      effectiveSource: "planar",
      textureWidth: 640,
      textureHeight: 360,
      distortionStrength: 0.04,
      filterSampleCount: 5
    });

    controller.setReflectionBinding();
    expect(controller.reflectionBinding).toBeUndefined();
    expect(runtimeMocks.setHeightfieldWaterSurfaceOpticsBinding).toHaveBeenLastCalledWith(
      materialState,
      expect.objectContaining({
        reflection: undefined,
        reflectionSampling: controller.reflectionSamplingSettings
      })
    );
    expect(controller.activeReflectionSampling).toMatchObject({ effectiveSource: "sky", filterSampleCount: 1 });
    controller.destroy();
  });

  it("applies the complete Experimental binding through High and retains one active readback", async () => {
    const { controller } = createRuntime();
    const resource = compileResource(WaterQualityTier.High);
    const binding = {
      tier: "experimental",
      opticalProfile: DEFAULT_WATER_OPTICAL_PROFILE,
      refractionEnabled: false,
      reflection: undefined,
      reflectionSampling: { highFilterSampleCount: 5 },
      debugView: HeightfieldWaterDebugMode.Fresnel
    } as const;
    controller.setSurfaceOpticsBinding(binding);

    await controller.replaceActiveIncremental("fixture", resource, { now: () => 0 });
    const firstReadback = controller.activeSurfaceOpticsReadback;
    expect(firstReadback).toMatchObject({
      requestedTier: "experimental",
      resolvedTier: "high",
      tierFallbackReason: "water-optics-experimental-resolved-high",
      refractionEnabled: false,
      debugView: HeightfieldWaterDebugMode.Fresnel
    });
    controller.setRefractionEnabled(true);
    expect(controller.activeSurfaceOpticsReadback).toBe(firstReadback);
    expect(controller.activeSurfaceOpticsReadback?.refractionEnabled).toBe(true);
    expect(runtimeMocks.setHeightfieldWaterOpticalProfile).not.toHaveBeenCalled();
    expect(runtimeMocks.setHeightfieldWaterReflectionBinding).not.toHaveBeenCalled();
    expect(runtimeMocks.setHeightfieldWaterRefractionEnabled).not.toHaveBeenCalled();

    const settingsIdentity = controller.reflectionSamplingSettings;
    for (let index = 0; index < 300; index++) controller.setSurfaceOpticsBinding(binding);
    expect(controller.reflectionSamplingSettings).toBe(settingsIdentity);
    expect(controller.activeSurfaceOpticsReadback).toBe(firstReadback);
    controller.destroy();
  });

  it("keeps the active set visible and releases the hidden set when a replacement is cancelled", async () => {
    const { controller, root } = createRuntime();
    const activeResource = compileResource(WaterQualityTier.Low);
    const cancelledResource = compileResource(WaterQualityTier.High);
    const texture = {
      width: 1024,
      height: 1024,
      destroyed: false,
      destroy: vi.fn()
    } as unknown as Texture2D;
    controller.setSurfaceAppearanceBinding(createAppearanceBinding(texture));
    await controller.replaceActiveIncremental("fixture", activeResource, {
      now: () => 0,
      yieldToMainThread: async () => undefined
    });
    const activeRoot = root.children[0];

    await expect(
      controller.replaceActiveIncremental("fixture", cancelledResource, { shouldCancel: () => true })
    ).rejects.toBeInstanceOf(HeightfieldWaterRuntimeSubmissionCancelledError);

    expect(controller.activeData?.sourceHash).toBe(activeResource.data.sourceHash);
    expect(activeRoot.isActive).toBe(true);
    expect(activeRoot.destroyed).toBe(false);
    expect(root.children[1].isActive).toBe(false);
    expect(root.children[1].destroyed).toBe(true);
    expect(cancelledResource.referenceCount).toBe(0);
    expect(texture.destroy).not.toHaveBeenCalled();

    controller.destroy();
    expect(texture.destroy).not.toHaveBeenCalled();
  });

  it("settles and destroys a hidden incremental set after controller teardown wins a yield", async () => {
    const { controller, root } = createRuntime();
    const resource = compileResource(WaterQualityTier.High);
    const borrowedTexture = {
      width: 1024,
      height: 1024,
      destroyed: false,
      destroy: vi.fn()
    } as unknown as Texture2D;
    controller.setSurfaceAppearanceBinding(createAppearanceBinding(borrowedTexture));
    let resumeYield: (() => void) | undefined;
    let notifyYield: (() => void) | undefined;
    const reachedYield = new Promise<void>((resolve) => {
      notifyYield = resolve;
    });
    const activation = controller.replaceActiveIncremental("fixture", resource, {
      frameBudgetMs: 0,
      now: () => 0,
      yieldToMainThread: () =>
        new Promise<void>((resolve) => {
          resumeYield = resolve;
          notifyYield?.();
        })
    });

    await reachedYield;
    controller.setSurfaceAppearanceBinding(undefined);
    controller.destroy();
    expect(controller.resourceMetrics).toMatchObject({
      activeRuntimeSetCount: 0,
      retainedRuntimeSetCount: 0,
      runtimeSetCreateCount: 0,
      runtimeSetDestroyCount: 0
    });
    expect(root.children[0].destroyed).toBe(false);
    expect(borrowedTexture.destroy).not.toHaveBeenCalled();

    resumeYield?.();
    await expect(activation).rejects.toBeInstanceOf(HeightfieldWaterRuntimeSubmissionCancelledError);
    expect(root.children[0].destroyed).toBe(true);
    expect(resource.referenceCount).toBe(0);
    expect(controller.resourceMetrics).toMatchObject({
      activeRuntimeSetCount: 0,
      retainedRuntimeSetCount: 0,
      materialCreateCount: 1,
      materialDestroyCount: 1,
      localMapTextureCreateCount: 1,
      localMapTextureDestroyCount: 1
    });
    expect(controller.resourceMetrics.meshCreateCount).toBeGreaterThan(0);
    expect(controller.resourceMetrics.meshDestroyCount).toBe(controller.resourceMetrics.meshCreateCount);
    expect(borrowedTexture.destroy).not.toHaveBeenCalled();
  });

  it("atomically replaces the old set and flushes deferred GPU resources only on request", async () => {
    const { controller, root, gc } = createRuntime();
    const first = compileResource(WaterQualityTier.Low);
    const second = compileResource(WaterQualityTier.Medium);
    await controller.replaceActiveIncremental("fixture", first, { now: () => 0 });
    const firstRoot = root.children[0];
    await controller.replaceActiveIncremental("fixture", second, { now: () => 0 });

    expect(firstRoot.destroyed).toBe(true);
    expect(first.referenceCount).toBe(0);
    expect(second.referenceCount).toBe(1);
    expect(controller.activeData?.sourceHash).toBe(second.data.sourceHash);
    expect(gc).not.toHaveBeenCalled();
    controller.flushDeferredResources();
    expect(gc).toHaveBeenCalledOnce();
    controller.flushDeferredResources();
    expect(gc).toHaveBeenCalledOnce();

    controller.destroy();
  });
});
