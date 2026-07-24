import type { Engine, Material, Texture2D } from "@galacean/engine-core";
import { Entity } from "@galacean/engine-core";
import { describe, expect, it, vi } from "vitest";
import { WaterWaveModel } from "../../authoring/wave/enums/WaterWaveModel";
import type { CompiledWaterWaveSet } from "../../compiler/wave/CompiledWaterWaveTypes";
import { curvedMainRiverOceanPreview } from "../../demo/examples/ocean-preview/presets";
import { WaterFoamDebugView } from "../../runtime/interaction/WaterFoamTypes";
import { OceanWaterRuntimeController } from "../../runtime/ocean/OceanWaterRuntimeController";
import type { OceanWaterRuntimeConfig } from "../../runtime/ocean/OceanWaterRuntimeTypes";
import type {
  WaterWaveMaterialConfig,
  WaterWaveMaterialState
} from "../../runtime/wave/WaterWaveRuntimeTypes";
import type { WaterWaveShaderVariant } from "../../runtime/wave/enums/WaterWaveShaderVariant";
import type {
  WaterSurfaceOpticsBinding,
  WaterSurfaceOpticsBindingReadback,
  WaterSurfaceOpticsBindingState
} from "../../runtime/optics/WaterSurfaceOpticsTypes";
import { createOceanNearshoreFixture } from "../fixtures/oceanNearshoreFixture";

const resourceSpies = vi.hoisted(() => ({
  dynamicTextureCreate: vi.fn(),
  dynamicTextureDestroy: vi.fn(),
  staticTextureCreate: vi.fn(),
  staticTextureDestroy: vi.fn(),
  materialCreate: vi.fn(),
  materialDestroy: vi.fn()
}));

vi.mock("@galacean/engine-core", () => {
  class FakeBoundsVector {
    set(_x: number, _y: number, _z: number): void {}
  }

  class FakeModelMesh {
    readonly bounds = {
      min: new FakeBoundsVector(),
      max: new FakeBoundsVector()
    };

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
    readonly shaderData = {
      setFloat: (_name: string, _value: number) => undefined
    };

    setMaterial(_material: unknown): void {}
  }

  class FakeTexture2D {
    name = "";
    filterMode = 0;
    wrapModeU = 0;
    wrapModeV = 0;
    isGCIgnored = false;
    private _destroyed = false;

    constructor(
      _engine: unknown,
      _width: number,
      _height: number,
      _format: number,
      _mipmap: boolean,
      _readable: boolean
    ) {
      resourceSpies.dynamicTextureCreate();
    }

    setPixelBuffer(_buffer: Uint8Array): void {}

    destroy(_forceDestroy: boolean): void {
      if (this._destroyed) return;
      this._destroyed = true;
      resourceSpies.dynamicTextureDestroy();
    }
  }

  class FakeEntity {
    isActive = true;
    layer = 1;
    readonly transform = {
      setPosition: (_x: number, _y: number, _z: number) => undefined
    };

    createChild(_name: string): FakeEntity {
      return new FakeEntity();
    }

    addComponent<T>(componentType: new () => T): T {
      return new componentType();
    }

    destroy(): void {
      this.isActive = false;
    }
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
  const createMaterial = (): Material => {
    resourceSpies.materialCreate();
    let destroyed = false;
    return {
      destroy: () => {
        if (destroyed) return;
        destroyed = true;
        resourceSpies.materialDestroy();
      }
    } as unknown as Material;
  };
  const createState = (
    waveSet: CompiledWaterWaveSet,
    config: WaterWaveMaterialConfig,
    material = createMaterial()
  ): WaterWaveMaterialState => ({
    material,
    variant: waveSet.shaderWaveCount as WaterWaveShaderVariant,
    opticsTier:
      config.opticsTier === "medium"
        ? "medium"
        : config.opticsTier
          ? "high"
          : undefined,
    waveSet,
    opticsBindingState: {} as WaterSurfaceOpticsBindingState,
    surfaceDetailEnabled: config.surfaceDetail !== undefined,
    surfaceDetailLayerCount:
      config.surfaceDetail === undefined ? 0 : 3,
    nearshoreEnabled: config.nearshore !== undefined,
    nearshoreWaveEnabled:
      config.nearshore !== undefined &&
      config.nearshore.waveEnabled !== false,
    nearshoreStateEnabled: config.nearshore?.dynamic !== undefined,
    nearshoreBreakerEnabled:
      config.nearshore?.dynamic !== undefined &&
      config.nearshoreBreakerEnabled !== false,
    foamEnabled: config.foam !== undefined,
    analyticWhitecapEnabled:
      config.analyticWhitecapEnabled === true,
    foamDebugView:
      config.foam?.debugView ?? WaterFoamDebugView.Final
  });
  return {
    createWaterWaveMaterial: (
      _engine: Engine,
      waveSet: CompiledWaterWaveSet,
      config: WaterWaveMaterialConfig
    ): WaterWaveMaterialState => createState(waveSet, config),
    updateWaterWaveMaterial: (
      state: WaterWaveMaterialState,
      waveSet: CompiledWaterWaveSet,
      config: WaterWaveMaterialConfig
    ): WaterWaveMaterialState => ({
      ...createState(waveSet, config, state.material),
      opticsBindingState: state.opticsBindingState
    }),
    setWaterWaveSurfaceOpticsBinding: (
      _state: WaterWaveMaterialState,
      binding: WaterSurfaceOpticsBinding
    ): WaterSurfaceOpticsBindingReadback =>
      ({
        requestedTier: binding.tier,
        resolvedTier:
          binding.tier === "medium" ? "medium" : "high",
        effectiveSource:
          binding.reflection?.resolvedSource ?? "sky",
        refractionEnabled: binding.refractionEnabled,
        filterSampleCount: 1
      }) as WaterSurfaceOpticsBindingReadback,
    setWaterWaveSurfaceTimeOverride: () => undefined,
    setWaterWaveNearshoreDebugView: () => undefined,
    setWaterWaveNearshoreWaveEnabled: () => undefined,
    setWaterWaveNearshoreStateEnabled: () => undefined,
    setWaterWaveNearshoreBreakerEnabled: () => undefined,
    setWaterWaveFoamTexture: () => undefined
  };
});

vi.mock("../../runtime/ocean/OceanNearshoreFieldTextureFactory", () => ({
  createOceanNearshoreFieldTexture: (): Texture2D => {
    resourceSpies.staticTextureCreate();
    let destroyed = false;
    return {
      destroy: () => {
        if (destroyed) return;
        destroyed = true;
        resourceSpies.staticTextureDestroy();
      }
    } as unknown as Texture2D;
  }
}));

function createRuntimeConfig(): OceanWaterRuntimeConfig {
  const waveAsset = curvedMainRiverOceanPreview.waveAsset;
  if (waveAsset.model !== WaterWaveModel.DirectionalGerstner) {
    throw new Error("Ocean runtime test requires Gerstner waves.");
  }
  return {
    ...curvedMainRiverOceanPreview,
    waterBodyId: "ocean-runtime-test",
    waveAsset: {
      ...waveAsset,
      generator: { ...waveAsset.generator }
    },
    surfaceDetail: {
      strength: 0.08,
      scale: 0.2,
      speed: 0.03,
      wind: [1, 0]
    },
    nearshoreDescriptor: createOceanNearshoreFixture(),
    foamEnabled: true
  };
}

function createRuntime(): OceanWaterRuntimeController {
  const engine = {
    time: { elapsedTime: 0, frameCount: 0 }
  } as unknown as Engine;
  const root = new Entity(engine, "ocean-runtime-test-root");
  return new OceanWaterRuntimeController(
    engine,
    root,
    createRuntimeConfig()
  );
}

describe("OceanWaterRuntimeController ownership", () => {
  it("keeps focused toggles independent and resets their bounded state", () => {
    const runtime = createRuntime();
    const foamField = runtime.foamField;
    const eventQueue = runtime.interactionEventQueue;

    expect(runtime.metrics.nearshoreEnabled).toBe(true);
    expect(runtime.metrics.foamEnabled).toBe(true);
    expect(runtime.metrics.foamTextureCount).toBe(3);
    expect(runtime.metrics.foamDetailTextureCount).toBe(1);
    expect(runtime.metrics.foamDetailResourceBytes).toBeGreaterThan(0);
    expect(runtime.metrics.surfaceDetailTextureCount).toBe(1);
    expect(runtime.metrics.surfaceDetailResourceBytes).toBeGreaterThan(0);
    expect(runtime.metrics.activeNearshoreTextureCount).toBe(3);
    expect(runtime.metrics.foamTextureCreateCount).toBe(3);
    expect(runtime.metrics.activeFoamEventQueueCount).toBe(1);
    expect(runtime.metrics.foamResourceBytes).toBeGreaterThan(0);
    expect(runtime.metrics.nearshoreResourceBytes).toBeGreaterThan(0);

    runtime.setNearshoreWaveEnabled(false);
    runtime.setNearshoreBreakerEnabled(false);
    runtime.setFoamBreakerSourceEnabled(false);
    runtime.setShoreFoamEnabled(false);
    runtime.setRockContactEnabled(false);

    expect(runtime.metrics).toMatchObject({
      nearshoreWaveEnabled: false,
      nearshoreStateEnabled: true,
      nearshoreBreakerEnabled: false,
      foamEnabled: true,
      foamBreakerSourceEnabled: false,
      foamShoreSourceEnabled: false,
      rockContactEnabled: false
    });

    runtime.setNearshoreWaveEnabled(true);
    runtime.setNearshoreBreakerEnabled(true);
    runtime.setFoamBreakerSourceEnabled(true);
    runtime.setShoreFoamEnabled(true);
    runtime.setRockContactEnabled(true);
    runtime.setFoamDebugView(WaterFoamDebugView.History);
    runtime.setSurfaceTimeOverride(2);
    runtime.update(1 / 60, { x: 2, z: -3 });

    expect(runtime.metrics).toMatchObject({
      nearshoreWaveEnabled: true,
      nearshoreBreakerEnabled: true,
      foamBreakerSourceEnabled: true,
      foamShoreSourceEnabled: true,
      rockContactEnabled: true,
      foamDebugView: WaterFoamDebugView.History
    });
    expect(runtime.metrics.foamCurrentSurfaceQueryCount).toBe(0);

    runtime.resetRockContacts();
    runtime.resetFoam();
    runtime.resetNearshoreState();
    expect(foamField?.isIdle).toBe(true);
    expect(eventQueue?.count).toBe(0);
    expect(runtime.metrics.foamPendingEventCount).toBe(0);
    expect(runtime.metrics.nearshoreWetnessPeak).toBe(0);

    runtime.destroy();
  });

  it("balances meshes, materials, textures, and owned field resources after reconfigure and destroy", () => {
    for (const spy of Object.values(resourceSpies)) spy.mockClear();
    const runtime = createRuntime();

    runtime.setFoamEnabled(false);
    expect(runtime.foamField).toBeUndefined();
    expect(runtime.metrics.foamTextureCount).toBe(0);
    expect(runtime.metrics.foamDetailTextureCount).toBe(0);
    expect(runtime.metrics.foamDetailResourceBytes).toBe(0);
    expect(runtime.metrics.foamResourceBytes).toBe(0);
    expect(runtime.metrics.foamTextureCreateCount).toBe(
      runtime.metrics.foamTextureDestroyCount
    );
    expect(runtime.metrics.activeFoamEventQueueCount).toBe(0);
    expect(runtime.metrics.foamEventQueueCreateCount).toBe(
      runtime.metrics.foamEventQueueDestroyCount
    );
    runtime.setFoamEnabled(true);
    expect(runtime.metrics.foamTextureCount).toBe(3);

    runtime.destroy();

    expect(runtime.isDestroyed).toBe(true);
    expect(runtime.nearshoreFieldResource).toBeUndefined();
    expect(runtime.nearshoreStateField).toBeUndefined();
    expect(runtime.foamField).toBeUndefined();
    expect(runtime.interactionEventQueue).toBeUndefined();
    expect(runtime.metrics.activeMeshCount).toBe(0);
    expect(runtime.metrics.activeMaterialCount).toBe(0);
    expect(runtime.metrics.surfaceDetailTextureCount).toBe(0);
    expect(runtime.metrics.surfaceDetailResourceBytes).toBe(0);
    expect(runtime.metrics.foamDetailTextureCount).toBe(0);
    expect(runtime.metrics.foamDetailResourceBytes).toBe(0);
    expect(runtime.metrics.nearshoreResourceBytes).toBe(0);
    expect(runtime.metrics.nearshoreDynamicResourceBytes).toBe(0);
    expect(runtime.metrics.foamResourceBytes).toBe(0);
    expect(runtime.metrics.activeNearshoreTextureCount).toBe(0);
    expect(runtime.metrics.nearshoreTextureCreateCount).toBe(
      runtime.metrics.nearshoreTextureDestroyCount
    );
    expect(runtime.metrics.foamTextureCreateCount).toBe(
      runtime.metrics.foamTextureDestroyCount
    );
    expect(runtime.metrics.activeFoamEventQueueCount).toBe(0);
    expect(runtime.metrics.foamEventQueueCreateCount).toBe(
      runtime.metrics.foamEventQueueDestroyCount
    );
    expect(runtime.metrics.meshCreateCount).toBe(
      runtime.metrics.meshDestroyCount
    );
    expect(runtime.metrics.materialCreateCount).toBe(
      runtime.metrics.materialDestroyCount
    );
    expect(resourceSpies.dynamicTextureCreate).toHaveBeenCalledTimes(
      resourceSpies.dynamicTextureDestroy.mock.calls.length
    );
    expect(resourceSpies.staticTextureCreate).toHaveBeenCalledTimes(
      resourceSpies.staticTextureDestroy.mock.calls.length
    );
    expect(resourceSpies.materialCreate).toHaveBeenCalledTimes(
      resourceSpies.materialDestroy.mock.calls.length
    );
  });
});
