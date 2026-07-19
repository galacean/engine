import type { Engine, Material } from "@galacean/engine-core";
import { Entity } from "@galacean/engine-core";
import { describe, expect, it, vi } from "vitest";
import { WaterQualityTier } from "../../authoring/wave/enums/WaterQualityTier";
import { WaterWaveModel } from "../../authoring/wave/enums/WaterWaveModel";
import type { CompiledWaterWaveSet } from "../../compiler/wave/CompiledWaterWaveTypes";
import { OceanPreviewController } from "../../demo/examples/ocean-preview/OceanPreviewController";
import { curvedMainRiverOceanPreview } from "../../demo/examples/ocean-preview/presets";
import type { OceanPreviewConfig } from "../../demo/examples/ocean-preview/types";
import type { WaterWaveShaderVariant } from "../../runtime/wave/enums/WaterWaveShaderVariant";
import type { WaterWaveMaterialState } from "../../runtime/wave/WaterWaveRuntimeTypes";

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

    setMaterial(_material: unknown): void {}
  }

  class FakeEntity {
    isActive = true;

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
    MeshRenderer: FakeMeshRenderer,
    ModelMesh: FakeModelMesh
  };
});

vi.mock("../../runtime/wave/WaterWaveMaterialFactory", () => {
  const createMaterial = (): Material => ({ destroy: () => undefined }) as unknown as Material;
  return {
    createWaterWaveMaterial: (_engine: Engine, waveSet: CompiledWaterWaveSet): WaterWaveMaterialState => ({
      material: createMaterial(),
      variant: waveSet.shaderWaveCount as WaterWaveShaderVariant,
      waveSet
    }),
    updateWaterWaveMaterial: (
      state: WaterWaveMaterialState,
      waveSet: CompiledWaterWaveSet
    ): WaterWaveMaterialState => ({ ...state, waveSet }),
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

describe("OceanPreviewController static GPU grid", () => {
  it("does not upload the mesh for RAF or wave/material configuration changes", () => {
    const config = createConfig();
    const controller = createController(config);

    for (let frame = 0; frame < 300; frame++) controller.update(1 / 60);
    controller.setConfig({ ...config, amplitudeScale: 1.25, timeScale: 1.1, alpha: 0.8 });
    controller.setConfig({ ...config, quality: WaterQualityTier.High });

    expect(controller.metrics.frameCount).toBe(300);
    expect(controller.metrics.meshUploadCount).toBe(1);
    expect(controller.metrics.meshCreateCount).toBe(1);
    expect(controller.metrics.perFrameMeshUpload).toBe(false);
    expect(controller.metrics.activeWaveCount).toBe(12);
    expect(controller.metrics.activeMeshCount).toBe(1);
    expect(controller.metrics.activeMaterialCount).toBe(1);
  });

  it("uploads only for size/resolution changes and balances resources after stress/destroy", () => {
    const config = createConfig();
    const controller = createController(config);

    controller.setConfig({ ...config, size: config.size + 1 });
    controller.setConfig({ ...config, size: config.size + 1, resolution: config.resolution + 1 });
    expect(controller.metrics.meshUploadCount).toBe(3);
    expect(controller.metrics.meshCreateCount).toBe(3);
    expect(controller.metrics.meshDestroyCount).toBe(2);

    const stress = controller.stressReconfigure(100);
    expect(stress.completedIterations).toBe(100);
    expect(stress.finalMeshUploadCount).toBe(stress.initialMeshUploadCount);
    expect(stress.activeMeshCount).toBe(1);
    expect(stress.activeMaterialCount).toBe(1);

    controller.destroy();
    expect(controller.metrics.activeMeshCount).toBe(0);
    expect(controller.metrics.activeMaterialCount).toBe(0);
    expect(controller.metrics.meshCreateCount).toBe(controller.metrics.meshDestroyCount);
    expect(controller.metrics.materialCreateCount).toBe(controller.metrics.materialDestroyCount);
  });
});
