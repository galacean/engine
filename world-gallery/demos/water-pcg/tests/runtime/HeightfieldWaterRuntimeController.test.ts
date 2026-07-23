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
    }
  })),
  updateHeightfieldWaterMaterial: vi.fn(),
  setHeightfieldWaterCompositionMode: vi.fn(),
  setHeightfieldWaterDebugMode: vi.fn(),
  setHeightfieldWaterDepthWriteEnabled: vi.fn(),
  setHeightfieldWaterFeatureFlags: vi.fn(),
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
  setHeightfieldWaterSurfaceOpticsBinding: runtimeMocks.setHeightfieldWaterSurfaceOpticsBinding,
  setHeightfieldWaterSurfaceTimeOverride: runtimeMocks.setHeightfieldWaterSurfaceTimeOverride
}));

import type { Engine, Entity } from "@galacean/engine-core";
import { WaterQualityTier } from "../../authoring/wave/enums/WaterQualityTier";
import { HeightfieldWaterCompiler } from "../../compiler/heightfield/HeightfieldWaterCompiler";
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

    const uploadCount = controller.meshUploadCount;
    controller.setDebugMode(HeightfieldWaterDebugMode.Flow);
    controller.setRefractionEnabled(false);
    controller.setCompositionMode(HeightfieldWaterCompositionMode.PrecomposedReplace);
    controller.setDepthWriteEnabled(true);
    controller.setFeatureFlags({ waves: false, microNormals: true, foam: false });
    controller.setSurfaceTimeOverride(86400);
    controller.setOpticalProfile(DEFAULT_WATER_OPTICAL_PROFILE);
    controller.updateMaterial(resource.data.material);
    expect(controller.meshUploadCount).toBe(uploadCount);
    expect(runtimeMocks.uploadHeightfieldWaterMesh).toHaveBeenCalledTimes(uploadCount);

    controller.destroy();
    expect(resource.referenceCount).toBe(0);
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

    controller.destroy();
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
