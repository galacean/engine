import type { Engine, Material, Texture2D } from "@galacean/engine-core";
import { Entity } from "@galacean/engine-core";
import { describe, expect, it, vi } from "vitest";
import { WaterWaveModel } from "../../authoring/wave/enums/WaterWaveModel";
import type { CompiledWaterWaveSet } from "../../compiler/wave/CompiledWaterWaveTypes";
import { curvedMainRiverOceanPreview } from "../../demo/examples/ocean-preview/presets";
import {
  WaterFoamBlendMode,
  WaterFoamDebugView,
  WaterFoamSourceKind
} from "../../runtime/interaction/WaterFoamTypes";
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
  const validateWaterFoamDetailTextureBinding = (
    binding: WaterWaveMaterialConfig["foamDetail"]
  ): void => {
    if (!binding) return;
    const texture = binding.texture;
    if (
      binding.ownership !== "borrowed" ||
      !Number.isFinite(binding.resourceBytes) ||
      binding.resourceBytes <= 0 ||
      !texture ||
      texture.destroyed ||
      !Number.isFinite(texture.width) ||
      !Number.isFinite(texture.height) ||
      texture.width <= 0 ||
      texture.height <= 0
    ) {
      throw new Error(
        "Water foam detail texture binding is unavailable or has an invalid resource budget."
      );
    }
  };
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
    validateWaterFoamDetailTextureBinding,
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
  it("applies per-body nearshore state tuning and rebuilds when it changes", () => {
    const config = createRuntimeConfig();
    const runtime = new OceanWaterRuntimeController(
      {
        time: { elapsedTime: 0, frameCount: 0 }
      } as unknown as Engine,
      new Entity(
        {} as Engine,
        "ocean-runtime-nearshore-options-root"
      ),
      {
        ...config,
        nearshoreStateOptions: {
          swashPeriodSeconds: 7,
          minimumRunupDistance: 0.1,
          maximumRunupDistance: 2.6,
          filmDepth: 0.04
        }
      }
    );
    const firstState = runtime.nearshoreStateField;
    expect(firstState?.configuration).toMatchObject({
      swashPeriodSeconds: 7,
      minimumRunupDistance: 0.1,
      maximumRunupDistance: 2.6,
      filmDepth: 0.04
    });

    runtime.setConfig({
      ...config,
      nearshoreStateOptions: {
        swashPeriodSeconds: 5.8,
        maximumRunupDistance: 1.9
      }
    });

    expect(runtime.nearshoreStateField).not.toBe(firstState);
    expect(runtime.nearshoreStateField?.configuration).toMatchObject({
      swashPeriodSeconds: 5.8,
      maximumRunupDistance: 1.9
    });
    runtime.destroy();
  });

  it("rebuilds only the bounded Foam state when per-body source tuning changes", () => {
    const config = createRuntimeConfig();
    const runtime = new OceanWaterRuntimeController(
      {
        time: { elapsedTime: 0, frameCount: 0 }
      } as unknown as Engine,
      new Entity(
        {} as Engine,
        "ocean-runtime-foam-options-root"
      ),
      config
    );
    const firstNearshore = runtime.nearshoreStateField;
    const firstFoam = runtime.foamField;

    runtime.setConfig({
      ...config,
      foamSourceOptions: {
        breakerIntensity: 0.65,
        shoreIntensity: 0.45,
        shoreBandWidth: 1.25,
        shoreSeawardOffset: 3.8
      }
    });

    expect(runtime.nearshoreStateField).toBe(
      firstNearshore
    );
    expect(runtime.foamField).not.toBe(firstFoam);
    expect(runtime.metrics).toMatchObject({
      foamTextureCreateCount: 6,
      foamTextureDestroyCount: 3,
      activeFoamEventQueueCount: 1
    });
    runtime.destroy();
  });

  it("rejects invalid Foam source tuning before allocating runtime resources", () => {
    for (const spy of Object.values(resourceSpies)) spy.mockClear();
    const config = createRuntimeConfig();

    expect(
      () =>
        new OceanWaterRuntimeController(
          {
            time: { elapsedTime: 0, frameCount: 0 }
          } as unknown as Engine,
          new Entity(
            {} as Engine,
            "ocean-runtime-invalid-foam-options-root"
          ),
          {
            ...config,
            foamSourceOptions: {
              breakerMinimumActivation: 0.8,
              breakerFullActivation: 0.4
            }
          }
        )
    ).toThrow(/foam source system options are invalid/i);
    for (const spy of Object.values(resourceSpies)) {
      expect(spy).not.toHaveBeenCalled();
    }
  });

  it("consumes typed wakes after a fixed-time frame has settled", () => {
    const runtime = createRuntime();
    runtime.setSurfaceTimeOverride(2);
    runtime.update(1 / 60, { x: 2, z: -3 });
    const settledMetrics = runtime.metrics;

    expect(runtime.metrics.foamWakeInjectionCount).toBe(0);
    expect(
      runtime.enqueueFoamSource({
        bodyId: runtime.waterBodyId,
        kind: WaterFoamSourceKind.Wake,
        intensity: 0.82,
        lifetimeSeconds: 2.4,
        priority: 2,
        blend: WaterFoamBlendMode.Maximum,
        range: {
          kind: "circle",
          worldX: 1,
          worldZ: -2,
          radius: 1.2
        }
      })
    ).toBe(true);

    runtime.update(1 / 60, { x: 2, z: -3 });

    expect(runtime.metrics.foamWakeInjectionCount).toBe(1);
    expect(runtime.metrics.foamFixedTimePrewarmCount).toBe(
      settledMetrics.foamFixedTimePrewarmCount
    );
    expect(runtime.metrics.foamHistoryUpdateCount).toBe(
      settledMetrics.foamHistoryUpdateCount + 1
    );
    expect(runtime.metrics.foamUploadCount).toBe(
      settledMetrics.foamUploadCount + 1
    );
    runtime.destroy();
  });

  it("rebuilds fixed-time Foam with bounded deterministic prewarm", () => {
    const runtime = createRuntime();
    const initialMetrics = runtime.metrics;

    runtime.setSurfaceTimeOverride(2);
    runtime.update(1 / 60, { x: 2, z: -3 });

    const firstHistory = runtime.foamField?.historyBuffer.slice();
    expect(firstHistory?.some((value) => value > 0)).toBe(
      true
    );
    expect(runtime.metrics).toMatchObject({
      foamFixedTimePrewarmCount: 1,
      foamFixedTimePrewarmStepCount: 2,
      foamHistoryUpdateCount:
        initialMetrics.foamHistoryUpdateCount + 2,
      foamUploadCount: initialMetrics.foamUploadCount + 1
    });

    const settledMetrics = runtime.metrics;
    runtime.update(1 / 60, { x: 2, z: -3 });
    expect(runtime.metrics.foamHistoryUpdateCount).toBe(
      settledMetrics.foamHistoryUpdateCount
    );
    expect(runtime.metrics.foamUploadCount).toBe(
      settledMetrics.foamUploadCount
    );

    runtime.resetFoam();
    expect(runtime.foamField?.isIdle).toBe(true);
    runtime.update(1 / 60, { x: 2, z: -3 });
    expect(runtime.foamField?.historyBuffer).toEqual(
      firstHistory
    );
    expect(runtime.metrics.foamFixedTimePrewarmCount).toBe(2);

    runtime.setSurfaceTimeOverride(4);
    runtime.update(1 / 60, { x: 2, z: -3 });
    runtime.setSurfaceTimeOverride(2);
    runtime.update(1 / 60, { x: 2, z: -3 });

    expect(runtime.foamField?.historyBuffer).toEqual(
      firstHistory
    );
    expect(runtime.metrics).toMatchObject({
      foamFixedTimePrewarmCount: 4,
      foamFixedTimePrewarmStepCount: 2
    });
    runtime.destroy();
  });

  it("keeps the live Foam path at one update and upload per frame", () => {
    const runtime = createRuntime();
    const initialMetrics = runtime.metrics;

    runtime.update(1 / 30, { x: 2, z: -3 });

    expect(runtime.metrics).toMatchObject({
      foamFixedTimePrewarmCount: 0,
      foamFixedTimePrewarmStepCount: 0,
      foamHistoryUpdateCount:
        initialMetrics.foamHistoryUpdateCount + 1,
      foamUploadCount: initialMetrics.foamUploadCount + 1
    });
    runtime.destroy();
  });

  it("accounts for a borrowed external foam detail texture without owning it", () => {
    const config = createRuntimeConfig();
    const borrowedTexture = {
      width: 512,
      height: 512,
      destroyed: false
    } as Texture2D;
    const runtime = new OceanWaterRuntimeController(
      {
        time: { elapsedTime: 0, frameCount: 0 }
      } as unknown as Engine,
      new Entity(
        {} as Engine,
        "ocean-runtime-external-foam-root"
      ),
      {
        ...config,
        foamDetail: {
          texture: borrowedTexture,
          ownership: "borrowed",
          resourceBytes: 1_398_101
        }
      }
    );

    expect(runtime.metrics).toMatchObject({
      foamDetailTextureCount: 1,
      foamDetailTextureSource: "external",
      foamDetailResourceBytes: 1_398_101
    });
    runtime.destroy();
    expect(borrowedTexture.destroyed).toBe(false);
  });

  it("rejects an invalid external foam detail binding before mutating config or resources", () => {
    for (const spy of Object.values(resourceSpies)) spy.mockClear();
    const runtime = createRuntime();
    const internalRuntime = runtime as unknown as {
      readonly _config: OceanWaterRuntimeConfig;
    };
    const previousConfig = internalRuntime._config;
    const previousMetrics = runtime.metrics;
    const previousNearshoreState = runtime.nearshoreStateField;
    const previousFoamField = runtime.foamField;
    const previousResourceCallCounts = Object.values(
      resourceSpies
    ).map((spy) => spy.mock.calls.length);

    expect(() =>
      runtime.setConfig({
        ...createRuntimeConfig(),
        waterLevel: previousConfig.waterLevel + 3,
        amplitudeScale: previousConfig.amplitudeScale * 0.5,
        nearshoreDescriptor: createOceanNearshoreFixture(),
        foamDetail: {
          texture: {
            width: 512,
            height: 512,
            destroyed: true
          } as Texture2D,
          ownership: "borrowed",
          resourceBytes: 1_398_100
        }
      })
    ).toThrow(/binding is unavailable/);

    expect(internalRuntime._config).toBe(previousConfig);
    expect(runtime.metrics).toEqual(previousMetrics);
    expect(runtime.nearshoreStateField).toBe(
      previousNearshoreState
    );
    expect(runtime.foamField).toBe(previousFoamField);
    expect(
      Object.values(resourceSpies).map(
        (spy) => spy.mock.calls.length
      )
    ).toEqual(previousResourceCallCounts);

    runtime.destroy();
  });

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
