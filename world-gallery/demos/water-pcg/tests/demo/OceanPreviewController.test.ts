import type { Engine, Material } from "@galacean/engine-core";
import { Downsampling, Entity } from "@galacean/engine-core";
import { describe, expect, it, vi } from "vitest";
import { WaterQualityTier } from "../../authoring/wave/enums/WaterQualityTier";
import { WaterWaveModel } from "../../authoring/wave/enums/WaterWaveModel";
import type { CompiledWaterWaveSet } from "../../compiler/wave/CompiledWaterWaveTypes";
import { OceanPreviewController } from "../../demo/examples/ocean-preview/OceanPreviewController";
import { curvedMainRiverOceanPreview } from "../../demo/examples/ocean-preview/presets";
import type { OceanPreviewConfig } from "../../demo/examples/ocean-preview/types";
import { createOceanNearshoreFieldSample } from "../../runtime/ocean/OceanNearshoreFieldProvider";
import type { WaterWaveShaderVariant } from "../../runtime/wave/enums/WaterWaveShaderVariant";
import type { WaterWaveMaterialConfig, WaterWaveMaterialState } from "../../runtime/wave/WaterWaveRuntimeTypes";
import { setWaterWaveSurfaceOpticsBinding } from "../../runtime/wave/WaterWaveMaterialFactory";
import type { WaterReflectionRequest } from "../../runtime/optics/WaterReflectionPolicy";
import type { WaterReflectionService } from "../../runtime/optics/WaterReflectionService";
import type {
  CameraWaterFeatureBroker,
  WaterCameraFeatureRequest
} from "../../runtime/optics/CameraWaterFeatureBroker";
import type {
  WaterSurfaceOpticsBinding,
  WaterSurfaceOpticsBindingReadback,
  WaterSurfaceOpticsBindingState
} from "../../runtime/optics/WaterSurfaceOpticsTypes";
import { createOceanNearshoreFixture } from "../fixtures/oceanNearshoreFixture";

const nearshoreTextureDestroy = vi.hoisted(() => vi.fn());
const nearshoreDynamicTextureDestroy = vi.hoisted(() => vi.fn());

vi.mock("@galacean/engine-core", () => {
  class FakeBoundsVector {
    set(_x: number, _y: number, _z: number): void {}
  }

  class FakeModelMesh {
    readonly bounds = { min: new FakeBoundsVector(), max: new FakeBoundsVector() };

    constructor(_engine: unknown) {}

    setPositions(_positions: readonly unknown[]): void {}
    setUVs(_uvs: readonly unknown[]): void {}
    setIndices(_indices: Uint16Array | Uint32Array): void {}
    addSubMesh(_start: number, _count: number): void {}
    uploadData(_noLongerAccessible: boolean): void {}
    destroy(_forceDestroy: boolean): void {}
  }

  class FakeMeshRenderer {
    mesh: unknown;
    isCulled = false;
    readonly shaderData = { setFloat: () => undefined };

    setMaterial(_material: unknown): void {}
  }

  class FakeTexture2D {
    name = "";
    filterMode = 0;
    wrapModeU = 0;
    wrapModeV = 0;
    isGCIgnored = false;

    constructor(
      _engine: unknown,
      _width: number,
      _height: number,
      _format: number,
      _mipmap: boolean,
      _readable: boolean
    ) {}

    setPixelBuffer(_buffer: Uint8Array): void {}

    destroy(_forceDestroy: boolean): void {
      nearshoreDynamicTextureDestroy();
    }
  }

  class FakeEntity {
    isActive = true;
    layer = 1;
    readonly transform = { setPosition: (_x: number, _y: number, _z: number) => undefined };

    createChild(_name: string): FakeEntity {
      return new FakeEntity();
    }

    addComponent<T>(componentType: new () => T): T {
      return new componentType();
    }

    destroy(): void {}
  }

  return {
    Engine: class FakeEngine {},
    Entity: FakeEntity,
    Downsampling: { None: 0, TwoX: 1, FourX: 2 },
    Layer: { Layer30: 0x40000000, Everything: 0xffffffff },
    MeshRenderer: FakeMeshRenderer,
    ModelMesh: FakeModelMesh,
    Texture2D: FakeTexture2D,
    TextureFilterMode: { Bilinear: 1 },
    TextureFormat: { R8G8B8A8: 1, R8: 2 },
    TextureWrapMode: { Clamp: 1 }
  };
});

vi.mock("../../runtime/wave/WaterWaveMaterialFactory", () => {
  const createMaterial = (): Material => ({ destroy: () => undefined }) as unknown as Material;
  return {
    createWaterWaveMaterial: (
      _engine: Engine,
      waveSet: CompiledWaterWaveSet,
      config: WaterWaveMaterialConfig
    ): WaterWaveMaterialState => ({
      material: createMaterial(),
      variant: waveSet.shaderWaveCount as WaterWaveShaderVariant,
      opticsTier:
        config.opticsTier === "medium"
          ? "medium"
          : config.opticsTier
            ? "high"
            : waveSet.quality === "high"
              ? "high"
              : waveSet.quality === "medium"
                ? "medium"
                : undefined,
      waveSet,
      opticsBindingState: {} as WaterSurfaceOpticsBindingState,
      nearshoreEnabled: config.nearshore !== undefined
    }),
    updateWaterWaveMaterial: (
      state: WaterWaveMaterialState,
      waveSet: CompiledWaterWaveSet,
      config: WaterWaveMaterialConfig
    ): WaterWaveMaterialState => ({
      ...state,
      waveSet,
      nearshoreEnabled: config.nearshore !== undefined
    }),
    setWaterWaveSurfaceOpticsBinding: vi.fn(
      (_state: WaterWaveMaterialState, binding: WaterSurfaceOpticsBinding): WaterSurfaceOpticsBindingReadback =>
        ({
          requestedTier: binding.tier,
          resolvedTier: binding.tier === "medium" ? "medium" : "high",
          effectiveSource: binding.reflection?.resolvedSource ?? "sky",
          refractionEnabled: binding.refractionEnabled
        }) as WaterSurfaceOpticsBindingReadback
    ),
    setWaterWaveSurfaceTimeOverride: () => undefined,
    setWaterWaveNearshoreDebugView: () => undefined,
    setWaterWaveNearshoreWaveEnabled: () => undefined,
    setWaterWaveNearshoreStateEnabled: () => undefined,
    setWaterWaveNearshoreBreakerEnabled: () => undefined,
    setWaterWaveFoamTexture: () => undefined,
    validateWaterFoamDetailTextureBinding: () => undefined
  };
});

vi.mock("../../runtime/ocean/OceanNearshoreFieldTextureFactory", () => ({
  createOceanNearshoreFieldTexture: () => ({
    destroy: nearshoreTextureDestroy
  })
}));

function createConfig(): OceanPreviewConfig {
  const waveAsset = curvedMainRiverOceanPreview.waveAsset;
  if (waveAsset.model !== WaterWaveModel.DirectionalGerstner) {
    throw new Error("Ocean preview fixture requires a directional Gerstner asset.");
  }
  return {
    ...curvedMainRiverOceanPreview,
    waveAsset: { ...waveAsset, generator: { ...waveAsset.generator } }
  };
}

function createController(config = createConfig()): OceanPreviewController {
  const engine = {
    time: { elapsedTime: 0, frameCount: 0 }
  } as unknown as Engine;
  const root = new Entity(engine, "test-root");
  return new OceanPreviewController(engine, root, config);
}

describe("OceanPreviewController camera-relative rings", () => {
  it("keeps immutable patch meshes while the camera travels and wave/material settings change", () => {
    const config = createConfig();
    const controller = createController(config);

    for (let frame = 0; frame < 300; frame++) controller.update(1 / 60, { x: frame * 40, z: -frame * 17 });
    const initialUploads = controller.metrics.meshUploadCount;
    controller.setConfig({ ...config, amplitudeScale: 1.25, timeScale: 1.1, alpha: 0.8 });
    controller.setConfig({ ...config, quality: WaterQualityTier.High });

    expect(controller.metrics.frameCount).toBe(300);
    expect(controller.metrics.meshUploadCount).toBe(initialUploads);
    expect(controller.metrics.meshCreateCount).toBe(37);
    expect(controller.metrics.perFrameMeshUpload).toBe(false);
    expect(controller.metrics.activeWaveCount).toBe(12);
    expect(controller.metrics.ringCount).toBe(3);
    expect(controller.metrics.patchCount).toBe(37);
    expect(controller.metrics.originSnapCount).toBeGreaterThan(250);
    expect(controller.metrics.activeMeshCount).toBe(37);
    expect(controller.metrics.activeMaterialCount).toBe(1);
  });

  it("uploads only for size/resolution changes and balances resources after stress/destroy", () => {
    const config = createConfig();
    const controller = createController(config);

    controller.setConfig({ ...config, size: config.size + 1 });
    controller.setConfig({ ...config, size: config.size + 1, resolution: config.resolution + 8 });
    expect(controller.metrics.meshUploadCount).toBe(37 * 3);
    expect(controller.metrics.meshCreateCount).toBe(37 * 3);
    expect(controller.metrics.meshDestroyCount).toBe(37 * 2);

    const stress = controller.stressReconfigure(100);
    expect(stress.completedIterations).toBe(100);
    expect(stress.finalMeshUploadCount).toBeGreaterThan(stress.initialMeshUploadCount);
    expect(stress.activeMeshCount).toBe(37);
    expect(stress.activeMaterialCount).toBe(1);

    controller.destroy();
    expect(controller.metrics.activeMeshCount).toBe(0);
    expect(controller.metrics.activeMaterialCount).toBe(0);
    expect(controller.metrics.meshCreateCount).toBe(controller.metrics.meshDestroyCount);
    expect(controller.metrics.materialCreateCount).toBe(controller.metrics.materialDestroyCount);
  });

  it("keeps the shared planar request synchronized with demo visibility", () => {
    const controller = createController();
    const requests: WaterReflectionRequest[] = [];
    const getBinding = vi.fn(() => ({ requestedSource: "probe", resolvedSource: "probe" }) as const);
    const service = {
      setRequest: (request: WaterReflectionRequest) => requests.push(request),
      removeRequest: () => true,
      getBinding
    } as unknown as WaterReflectionService;

    controller.setReflectionService(service);
    expect(controller.metrics.reflectionSource).toBe("probe");
    controller.setReflectionVisible(false);
    expect(controller.metrics.reflectionSource).toBe("sky");
    controller.setReflectionVisible(true);
    expect(controller.metrics.reflectionSource).toBe("probe");

    expect(requests.map((request) => request.visible)).toEqual([true, false, true]);
    expect(getBinding).toHaveBeenCalledTimes(2);

    controller.destroy();
    getBinding.mockClear();
    expect(() => controller.refreshReflectionBinding()).not.toThrow();
    expect(getBinding).not.toHaveBeenCalled();
  });

  it("requests Medium TwoX semantics, maps Experimental to High, and reapplies optics after variant rebuild", () => {
    const controller = createController();
    const requests: WaterCameraFeatureRequest[] = [];
    const removed: string[] = [];
    const broker = {
      setRequest: (_consumerId: string, request: WaterCameraFeatureRequest) => requests.push(request),
      removeRequest: (consumerId: string) => {
        removed.push(consumerId);
        return true;
      }
    } as unknown as CameraWaterFeatureBroker;
    const applyBinding = vi.mocked(setWaterWaveSurfaceOpticsBinding);
    applyBinding.mockClear();

    controller.setCameraFeatureBroker(broker);
    expect(requests.at(-1)).toMatchObject({
      depthTexture: true,
      opaqueTexture: true,
      quality: "medium",
      opaqueDownsampling: Downsampling.TwoX
    });
    expect(controller.metrics.requestedOpticsTier).toBe("medium");
    expect(controller.metrics.resolvedOpticsTier).toBe("medium");
    expect(controller.metrics.compiledOpticsTier).toBe("medium");
    expect(controller.metrics.refractionEnabled).toBe(true);

    const stateBeforeOpticsTierChange = applyBinding.mock.calls.at(-1)?.[0];
    controller.setOpticsTier("experimental");
    expect(requests.at(-1)).toMatchObject({ quality: "high", opaqueDownsampling: Downsampling.None });
    expect(controller.metrics.requestedOpticsTier).toBe("experimental");
    expect(controller.metrics.resolvedOpticsTier).toBe("high");
    expect(controller.metrics.compiledOpticsTier).toBe("high");
    expect(applyBinding.mock.calls.at(-1)?.[0]).not.toBe(stateBeforeOpticsTierChange);

    controller.setRefractionEnabled(false);
    expect(applyBinding.mock.calls.at(-1)?.[1].refractionEnabled).toBe(false);

    const stateBeforeRebuild = applyBinding.mock.calls.at(-1)?.[0];
    controller.setConfig({
      ...createConfig(),
      quality: WaterQualityTier.High,
      opticsTier: "high",
      refractionEnabled: true
    });
    const [stateAfterRebuild, bindingAfterRebuild] = applyBinding.mock.calls.at(-1) ?? [];
    expect(stateAfterRebuild).not.toBe(stateBeforeRebuild);
    expect(bindingAfterRebuild?.tier).toBe("high");
    expect(bindingAfterRebuild?.refractionEnabled).toBe(true);

    controller.setReflectionVisible(false);
    expect(removed).toContain(controller.opticsConsumerId);
    expect(applyBinding.mock.calls.at(-1)?.[1].refractionEnabled).toBe(false);
  });

  it("owns and releases the nearshore field, provider, texture, and obstacles as one runtime", () => {
    nearshoreTextureDestroy.mockClear();
    nearshoreDynamicTextureDestroy.mockClear();
    const controller = createController({
      ...createConfig(),
      nearshoreDescriptor: createOceanNearshoreFixture()
    });
    const field = controller.nearshoreFieldResource;
    const provider = controller.nearshoreFieldProvider;
    const obstacles = controller.obstacleFieldResource;
    const state = controller.nearshoreStateField;

    expect(field).toBeDefined();
    expect(provider).toBeDefined();
    expect(obstacles).toBeDefined();
    expect(state).toBeDefined();
    expect(field?.referenceCount).toBe(2);
    expect(controller.metrics.nearshoreEnabled).toBe(true);
    expect(controller.metrics.nearshoreWaveEnabled).toBe(true);
    expect(controller.metrics.nearshoreStateEnabled).toBe(true);
    expect(controller.metrics.nearshoreStateUpdateRateHz).toBe(30);
    expect(controller.metrics.nearshoreWetnessUploadRateHz).toBeLessThan(30);
    expect(controller.metrics.nearshoreStateUploadCount).toBe(1);
    expect(controller.metrics.nearshoreWetnessUploadCount).toBe(1);
    expect(controller.metrics.nearshoreDynamicResourceBytes).toBeGreaterThan(0);
    expect(controller.metrics.nearshoreWetTexelCount).toBeGreaterThan(0);
    expect(controller.metrics.nearshoreDryTexelCount).toBeGreaterThan(0);
    expect(controller.metrics.nearshoreResourceBytes).toBeGreaterThan(0);

    controller.destroy();

    expect(controller.isDestroyed).toBe(true);
    expect(controller.nearshoreFieldResource).toBeUndefined();
    expect(field?.isDisposed).toBe(true);
    expect(field?.byteLength).toBe(0);
    expect(state?.isDestroyed).toBe(true);
    expect(obstacles?.isDisposed).toBe(true);
    expect(nearshoreTextureDestroy).toHaveBeenCalledTimes(1);
    expect(nearshoreDynamicTextureDestroy).toHaveBeenCalledTimes(2);
    expect(() =>
      provider?.sample(0, 0, createOceanNearshoreFieldSample())
    ).toThrow(/destroyed/);
  });

  it("advances, freezes, toggles, and resets the owned nearshore state deterministically", () => {
    const controller = createController({
      ...createConfig(),
      nearshoreDescriptor: createOceanNearshoreFixture()
    });
    const field = controller.nearshoreStateField;
    expect(field).toBeDefined();

    for (let index = 0; index < 4; index++) {
      controller.update(1 / 120);
    }
    expect(field?.metrics.fixedStepCount).toBe(1);
    expect(controller.metrics.nearshoreStateUploadCount).toBe(2);
    expect(controller.nearshoreCurrentSnapshot?.revision).toBe(
      field?.metrics.revision
    );
    expect(controller.nearshoreWetnessTexture).toBeDefined();

    controller.setSurfaceTimeOverride(2);
    controller.update(1 / 60);
    const frozenRevision = field?.metrics.revision;
    controller.update(1 / 60);
    expect(field?.metrics.revision).toBe(frozenRevision);

    controller.setNearshoreWaveEnabled(false);
    controller.setNearshoreStateEnabled(false);
    expect(controller.metrics.nearshoreWaveEnabled).toBe(false);
    expect(controller.metrics.nearshoreStateEnabled).toBe(false);
    expect(controller.metrics.nearshoreThinFilmTexelCount).toBe(0);
    expect(controller.metrics.nearshoreWetnessTexelCount).toBe(0);

    controller.setNearshoreStateEnabled(true);
    controller.resetNearshoreState();
    expect(controller.metrics.nearshoreStateRevision).toBe(
      field?.metrics.revision
    );
    expect(controller.metrics.nearshoreWetnessPeak).toBe(0);
    controller.destroy();
  });

  it("owns, freezes, resets, and fully deallocates bounded Ocean foam and Impact state", () => {
    nearshoreDynamicTextureDestroy.mockClear();
    const controller = createController({
      ...createConfig(),
      nearshoreDescriptor: createOceanNearshoreFixture(),
      foamEnabled: true
    });
    const field = controller.foamField;
    const queue = controller.interactionEventQueue;

    expect(field).toBeDefined();
    expect(queue).toBeDefined();
    expect(controller.metrics.foamEnabled).toBe(true);
    expect(controller.metrics.analyticWhitecapEnabled).toBe(true);
    expect(controller.metrics.foamTextureCount).toBe(3);
    expect(controller.metrics.foamTargetUpdateRateHz).toBe(30);
    expect(controller.metrics.foamEventCapacity).toBe(16);
    expect(controller.metrics.foamCurrentSurfaceQueryCount).toBe(0);
    expect(controller.metrics.foamResourceBytes).toBeGreaterThan(0);

    for (let index = 0; index < 4; index++) {
      controller.update(1 / 60);
    }
    expect(controller.metrics.foamHistoryUpdateCount).toBeGreaterThan(0);
    expect(controller.metrics.foamUploadCount).toBeGreaterThan(0);

    controller.setSurfaceTimeOverride(2);
    controller.update(1 / 60);
    const frozenHistoryUpdates =
      controller.metrics.foamHistoryUpdateCount;
    controller.update(1 / 60);
    expect(controller.metrics.foamHistoryUpdateCount).toBe(
      frozenHistoryUpdates
    );

    controller.resetFoam();
    expect(field?.isIdle).toBe(true);
    expect(queue?.count).toBe(0);

    controller.setFoamEnabled(false);
    expect(controller.foamField).toBeUndefined();
    expect(controller.interactionEventQueue).toBeUndefined();
    expect(controller.metrics.foamEnabled).toBe(false);
    expect(controller.metrics.analyticWhitecapEnabled).toBe(false);
    expect(controller.metrics.foamTextureCount).toBe(0);
    expect(controller.metrics.foamResourceBytes).toBe(0);
    expect(controller.metrics.foamPendingEventCount).toBe(0);
    expect(nearshoreDynamicTextureDestroy).toHaveBeenCalledTimes(3);

    controller.destroy();
    expect(nearshoreDynamicTextureDestroy).toHaveBeenCalledTimes(5);
  });
});
