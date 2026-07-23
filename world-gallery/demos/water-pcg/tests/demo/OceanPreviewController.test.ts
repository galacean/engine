import type { Engine, Material } from "@galacean/engine-core";
import { Downsampling, Entity } from "@galacean/engine-core";
import { describe, expect, it, vi } from "vitest";
import { WaterQualityTier } from "../../authoring/wave/enums/WaterQualityTier";
import { WaterWaveModel } from "../../authoring/wave/enums/WaterWaveModel";
import type { CompiledWaterWaveSet } from "../../compiler/wave/CompiledWaterWaveTypes";
import { OceanPreviewController } from "../../demo/examples/ocean-preview/OceanPreviewController";
import { curvedMainRiverOceanPreview } from "../../demo/examples/ocean-preview/presets";
import type { OceanPreviewConfig } from "../../demo/examples/ocean-preview/types";
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
    ModelMesh: FakeModelMesh
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
      opticsBindingState: {} as WaterSurfaceOpticsBindingState
    }),
    updateWaterWaveMaterial: (
      state: WaterWaveMaterialState,
      waveSet: CompiledWaterWaveSet
    ): WaterWaveMaterialState => ({ ...state, waveSet }),
    setWaterWaveSurfaceOpticsBinding: vi.fn(
      (_state: WaterWaveMaterialState, binding: WaterSurfaceOpticsBinding): WaterSurfaceOpticsBindingReadback =>
        ({
          requestedTier: binding.tier,
          resolvedTier: binding.tier === "medium" ? "medium" : "high",
          effectiveSource: binding.reflection?.resolvedSource ?? "sky",
          refractionEnabled: binding.refractionEnabled
        }) as WaterSurfaceOpticsBindingReadback
    ),
    setWaterWaveSurfaceTimeOverride: () => undefined
  };
});

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
  const engine = {} as Engine;
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
});
