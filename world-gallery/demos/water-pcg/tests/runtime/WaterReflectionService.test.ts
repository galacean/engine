import { Camera, Entity, Layer, TextureCube } from "@galacean/engine-core";
import type { Engine } from "@galacean/engine-core";
import { Vector3 } from "@galacean/engine-math";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  WaterReflectionService,
  type WaterReflectionServiceOptions
} from "../../runtime/optics/WaterReflectionService";
import type { WaterReflectionRequest } from "../../runtime/optics/WaterReflectionPolicy";

const reflectionMock = vi.hoisted(() => ({
  renderCalls: 0,
  resetProjectionCalls: 0,
  failRender: false,
  failAllocation: false,
  failHdrAllocation: false,
  supportedTextureFormats: new Set<number>([1, 7, 35]),
  createdTextureFormats: [] as number[],
  renderedCameraStates: [] as Array<{
    readonly enableHDR: boolean;
    readonly enablePostProcess: boolean;
    readonly isAlphaOutputRequired: boolean;
  }>,
  renderTargetDestroyCalls: 0,
  textureDestroyCalls: 0,
  entityDestroyCalls: 0,
  lastRenderedProjection: undefined as Float32Array | undefined,
  lastReflectionPosition: undefined as [number, number, number] | undefined
}));

vi.mock("@galacean/engine-core", () => {
  interface MatrixLike {
    readonly elements: Float32Array;
  }

  interface Vector4Like {
    x: number;
    y: number;
    z: number;
    w: number;
  }

  const identity = (): MatrixLike => ({
    elements: new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])
  });

  const perspective = (fieldOfView: number, aspectRatio: number, near: number, far: number): MatrixLike => {
    const f = 1 / Math.tan((fieldOfView * Math.PI) / 360);
    const inverseDepth = 1 / (near - far);
    return {
      elements: new Float32Array([
        f / aspectRatio,
        0,
        0,
        0,
        0,
        f,
        0,
        0,
        0,
        0,
        (far + near) * inverseDepth,
        -1,
        0,
        0,
        2 * far * near * inverseDepth,
        0
      ])
    };
  };

  class FakeTransform {
    readonly worldPosition = { x: 2, y: 5, z: 7 };
    readonly worldForward = { x: 0, y: -0.5, z: -0.5 };
    readonly worldUp = { x: 0, y: 1, z: 0 };

    setPosition(x: number, y: number, z: number): void {
      this.worldPosition.x = x;
      this.worldPosition.y = y;
      this.worldPosition.z = z;
      reflectionMock.lastReflectionPosition = [x, y, z];
    }

    lookAt(): void {}
  }

  class FakeEntity {
    readonly transform = new FakeTransform();

    createChild(): FakeEntity {
      return new FakeEntity();
    }

    addComponent<T>(Type: new () => T): T {
      const component = new Type() as T & { entity?: FakeEntity };
      component.entity = this;
      return component;
    }

    destroy(): void {
      reflectionMock.entityDestroyCalls++;
    }
  }

  class FakeCamera {
    entity!: FakeEntity;
    enabled = true;
    fieldOfView = 60;
    isOrthographic = false;
    orthographicSize = 10;
    nearClipPlane = 0.1;
    farClipPlane = 300;
    aspectRatio = 4 / 3;
    clearFlags = 0;
    enableHDR = false;
    enablePostProcess = false;
    isAlphaOutputRequired = false;
    cullingMask = 0xffffffff;
    renderTarget: unknown = null;
    readonly viewMatrix = identity();
    private _viewport: Vector4Like = { x: 0, y: 0, z: 1, w: 1 };
    private _customProjection?: MatrixLike;

    get viewport(): Vector4Like {
      return this._viewport;
    }

    set viewport(value: Vector4Like) {
      this._viewport = { x: value.x, y: value.y, z: value.z, w: value.w };
    }

    get projectionMatrix(): MatrixLike {
      return (
        this._customProjection ?? perspective(this.fieldOfView, this.aspectRatio, this.nearClipPlane, this.farClipPlane)
      );
    }

    set projectionMatrix(value: MatrixLike) {
      this._customProjection = { elements: new Float32Array(value.elements) };
    }

    resetProjectionMatrix(): void {
      reflectionMock.resetProjectionCalls++;
      this._customProjection = undefined;
    }

    render(): void {
      reflectionMock.renderCalls++;
      reflectionMock.renderedCameraStates.push({
        enableHDR: this.enableHDR,
        enablePostProcess: this.enablePostProcess,
        isAlphaOutputRequired: this.isAlphaOutputRequired
      });
      reflectionMock.lastRenderedProjection = new Float32Array(this.projectionMatrix.elements);
      if (reflectionMock.failRender) throw new Error("simulated planar failure");
    }
  }

  class FakeTexture2D {
    filterMode = 0;
    wrapModeU = 0;
    wrapModeV = 0;
    private _destroyed = false;

    constructor(
      _engine: unknown,
      readonly width: number,
      readonly height: number,
      readonly format = 1
    ) {
      reflectionMock.createdTextureFormats.push(format);
    }

    destroy(): void {
      if (this._destroyed) return;
      this._destroyed = true;
      reflectionMock.textureDestroyCalls++;
    }
  }

  class FakeTextureCube {}

  class FakeRenderTarget {
    autoGenerateMipmaps = true;
    private _destroyed = false;

    constructor(
      _engine: unknown,
      readonly width: number,
      readonly height: number,
      texture: { readonly format?: number }
    ) {
      if (reflectionMock.failAllocation) throw new Error("simulated render-target allocation failure");
      if (reflectionMock.failHdrAllocation && texture.format !== 1) {
        throw new Error("simulated HDR render-target allocation failure");
      }
    }

    destroy(): void {
      if (this._destroyed) return;
      this._destroyed = true;
      reflectionMock.renderTargetDestroyCalls++;
    }
  }

  return {
    Camera: FakeCamera,
    Entity: FakeEntity,
    Engine: class FakeEngine {},
    Layer: { Everything: 0xffffffff, Layer30: 0x40000000 },
    RenderTarget: FakeRenderTarget,
    SystemInfo: {
      supportsTextureFormat: (_engine: unknown, format: number): boolean =>
        reflectionMock.supportedTextureFormats.has(format)
    },
    Texture2D: FakeTexture2D,
    TextureCube: FakeTextureCube,
    TextureFilterMode: { Bilinear: 1 },
    TextureFormat: {
      R8G8B8A8: 1,
      Depth24: 2,
      R16G16B16A16: 7,
      R11G11B10_UFloat: 35
    },
    TextureWrapMode: { Clamp: 1 }
  };
});

function createRequest(
  quality: WaterReflectionRequest["quality"],
  overrides: Partial<WaterReflectionRequest> = {}
): WaterReflectionRequest {
  return {
    id: "ocean",
    preferredSource: "planar",
    quality,
    visible: true,
    priority: 1,
    planeY: 0,
    cullingMask: Layer.Everything,
    waterLayerMask: Layer.Layer30,
    ...overrides
  };
}

function createService(options: WaterReflectionServiceOptions = {}) {
  const engine = {} as Engine;
  const root = new Entity(engine, "reflection-root");
  const sourceCamera = root.addComponent(Camera);
  let now = 0;
  const service = new WaterReflectionService(engine, root, sourceCamera, {
    now: () => (now += 0.25),
    estimatePlanarDrawCount: () => 7,
    ...options
  });
  service.setViewportSize(800, 600);
  return { engine, root, service, sourceCamera };
}

beforeEach(() => {
  reflectionMock.renderCalls = 0;
  reflectionMock.resetProjectionCalls = 0;
  reflectionMock.failRender = false;
  reflectionMock.failAllocation = false;
  reflectionMock.failHdrAllocation = false;
  reflectionMock.supportedTextureFormats = new Set([1, 7, 35]);
  reflectionMock.createdTextureFormats.length = 0;
  reflectionMock.renderedCameraStates.length = 0;
  reflectionMock.renderTargetDestroyCalls = 0;
  reflectionMock.textureDestroyCalls = 0;
  reflectionMock.entityDestroyCalls = 0;
  reflectionMock.lastRenderedProjection = undefined;
  reflectionMock.lastReflectionPosition = undefined;
});

describe("WaterReflectionService", () => {
  it("rejects duplicate direct services for one source Camera and permits replacement after destroy", () => {
    const { engine, root, service, sourceCamera } = createService();

    expect(() => new WaterReflectionService(engine, root, sourceCamera)).toThrowError(
      /already exists for this source Camera/
    );

    service.destroy();
    const replacement = new WaterReflectionService(engine, root, sourceCamera);
    expect(replacement).not.toBe(service);
    replacement.destroy();
  });

  it("shares repeated acquisitions and destroys Camera/RT resources only after the final idempotent release", () => {
    const engine = {} as Engine;
    const root = new Entity(engine, "reflection-root");
    const sourceCamera = root.addComponent(Camera);
    const first = WaterReflectionService.acquire(engine, root, sourceCamera);
    const second = WaterReflectionService.acquire(engine, root, sourceCamera);
    const service = first.service;
    service.setViewportSize(800, 600);
    service.setRequest(createRequest("high"));
    service.update(0);

    expect(second.service).toBe(service);
    expect(() => new WaterReflectionService(engine, root, sourceCamera)).toThrowError(
      /already exists for this source Camera/
    );
    expect(service.metrics).toMatchObject({
      planarCameraCount: 1,
      liveRenderTargetCount: 1,
      reflectionCameraCreateCount: 1,
      renderTargetCreateCount: 1
    });
    expect(() => service.destroy()).toThrowError(/must be released through its WaterReflectionServiceLease/);

    first.release();
    first.release();
    expect(service.metrics).toMatchObject({ planarCameraCount: 1, liveRenderTargetCount: 1 });

    second.release();
    expect(service.metrics).toMatchObject({
      planarCameraCount: 0,
      liveRenderTargetCount: 0,
      reflectionCameraCreateCount: 1,
      reflectionCameraDestroyCount: 1,
      renderTargetCreateCount: 1,
      renderTargetDestroyCount: 1
    });
    expect(() => service.setRequest(createRequest("high"))).toThrowError(/has been destroyed/);

    const replacement = WaterReflectionService.acquire(engine, root, sourceCamera);
    expect(replacement.service).not.toBe(service);
    replacement.release();
  });

  it("isolates the registries and bounded Planar resources of two source Cameras", () => {
    const engine = {} as Engine;
    const root = new Entity(engine, "reflection-root");
    const sourceCameraA = root.createChild("source-camera-a").addComponent(Camera);
    const sourceCameraB = root.createChild("source-camera-b").addComponent(Camera);
    const cameraA = WaterReflectionService.acquire(engine, root, sourceCameraA);
    const cameraB = WaterReflectionService.acquire(engine, root, sourceCameraB);
    cameraA.service.setViewportSize(800, 600);
    cameraB.service.setViewportSize(800, 600);
    cameraA.service.setRequest(createRequest("high", { id: "camera-a-water" }));
    cameraB.service.setRequest(createRequest("high", { id: "camera-b-water" }));

    cameraA.service.update(0);
    cameraB.service.update(0);

    expect(cameraA.service).not.toBe(cameraB.service);
    expect(cameraA.service.metrics).toMatchObject({ planarCameraCount: 1, liveRenderTargetCount: 1 });
    expect(cameraB.service.metrics).toMatchObject({ planarCameraCount: 1, liveRenderTargetCount: 1 });
    expect(reflectionMock.renderTargetDestroyCalls).toBe(0);

    cameraA.release();
    expect(cameraA.service.metrics).toMatchObject({ planarCameraCount: 0, liveRenderTargetCount: 0 });
    expect(cameraB.service.metrics).toMatchObject({ planarCameraCount: 1, liveRenderTargetCount: 1 });
    expect(reflectionMock.renderTargetDestroyCalls).toBe(1);

    cameraB.release();
    expect(reflectionMock.renderTargetDestroyCalls).toBe(2);
    expect(reflectionMock.entityDestroyCalls).toBe(2);
  });

  it("renders High with an oblique projection and exactly one render-target Y flip in the sampling VP", () => {
    const { service } = createService();
    service.setRequest(createRequest("high"));
    service.update(0);
    service.recordPlanarGpuTime(0.72);

    const binding = service.getBinding("ocean");
    const renderedProjection = reflectionMock.lastRenderedProjection;
    expect(binding).toMatchObject({ resolvedSource: "planar" });
    expect(binding?.planarTexture).toBeDefined();
    expect(binding?.planarViewProjection).toBeDefined();
    expect(renderedProjection).toBeDefined();
    expect(binding?.planarViewProjection?.elements[0]).toBeCloseTo(renderedProjection?.[0] ?? 0);
    expect(binding?.planarViewProjection?.elements[5]).toBeCloseTo(-(renderedProjection?.[5] ?? 0));
    expect(reflectionMock.resetProjectionCalls).toBe(1);
    expect(service.metrics).toMatchObject({
      planarCameraCount: 1,
      waterLayerMask: Layer.Layer30,
      waterLayerExcludedFromPlanar: true,
      planarUpdateCount: 1,
      renderTargetWidth: 400,
      renderTargetHeight: 300,
      estimatedRenderTargetBytes: 400 * 300 * 8,
      planarColorMode: "ldr",
      colorFormat: "r8g8b8a8-unorm",
      planarHDR: false,
      fallbackReason: undefined,
      resourceBytes: 400 * 300 * 8,
      lastPlanarDrawCount: 7,
      lastPlanarGpuMs: 0.72,
      planarGpuSampleCount: 1
    });
    expect(service.metrics.planarCameraCullingMask & Layer.Layer30).toBe(0);

    service.destroy();
    expect(binding?.planarTexture).toBeUndefined();
    expect(binding?.planarViewProjection).toBeUndefined();
    expect(service.metrics).toMatchObject({
      planarCameraCount: 0,
      planarOwnerId: undefined,
      selectedPlanarOwnerId: undefined,
      renderedPlanarOwnerId: undefined,
      activeConsumerCount: 0,
      renderTargetCreateCount: 1,
      renderTargetDestroyCount: 1,
      reflectionCameraCreateCount: 1,
      reflectionCameraDestroyCount: 1,
      liveRenderTargetCount: 0
    });
  });

  it("renders hdr-preferred into linear R11G11B10 without post-processing", () => {
    const { service } = createService();
    service.setRequest(createRequest("high", { planarColorMode: "hdr-preferred" }));

    service.update(0);

    expect(reflectionMock.createdTextureFormats).toEqual([35]);
    expect(reflectionMock.renderedCameraStates).toEqual([
      {
        enableHDR: true,
        enablePostProcess: false,
        isAlphaOutputRequired: false
      }
    ]);
    expect(service.getBinding("ocean")).toMatchObject({
      resolvedSource: "planar",
      planarColorFormat: "r11g11b10-ufloat",
      planarHDR: true,
      planarColorFallbackReason: undefined
    });
    expect(service.metrics).toMatchObject({
      planarColorMode: "hdr-preferred",
      colorFormat: "r11g11b10-ufloat",
      planarHDR: true,
      fallbackReason: undefined,
      resourceBytes: 400 * 300 * 8,
      liveRenderTargetCount: 1,
      planarCameraCount: 1
    });

    service.destroy();
    expect(service.metrics).toMatchObject({
      liveRenderTargetCount: 0,
      planarCameraCount: 0,
      resourceBytes: 0
    });
  });

  it("uses linear RGBA16F when the source Camera requires alpha", () => {
    const { service, sourceCamera } = createService();
    sourceCamera.isAlphaOutputRequired = true;
    service.setRequest(createRequest("high", { planarColorMode: "hdr-preferred" }));

    service.update(0);

    expect(reflectionMock.createdTextureFormats).toEqual([7]);
    expect(reflectionMock.renderedCameraStates[0]).toEqual({
      enableHDR: true,
      enablePostProcess: false,
      isAlphaOutputRequired: true
    });
    expect(service.metrics).toMatchObject({
      colorFormat: "r16g16b16a16-float",
      planarHDR: true,
      resourceBytes: 400 * 300 * 12
    });
  });

  it("falls back to LDR with explicit metrics when HDR format support is unavailable", () => {
    reflectionMock.supportedTextureFormats = new Set([1]);
    const { service } = createService();
    service.setRequest(createRequest("high", { planarColorMode: "hdr-preferred" }));

    service.update(0);

    expect(reflectionMock.createdTextureFormats).toEqual([1]);
    expect(reflectionMock.renderedCameraStates[0]).toMatchObject({
      enableHDR: false,
      enablePostProcess: false
    });
    expect(service.getBinding("ocean")).toMatchObject({
      resolvedSource: "planar",
      planarColorFormat: "r8g8b8a8-unorm",
      planarHDR: false,
      planarColorFallbackReason: "hdr-format-unsupported"
    });
    expect(service.metrics).toMatchObject({
      planarColorMode: "hdr-preferred",
      colorFormat: "r8g8b8a8-unorm",
      planarHDR: false,
      fallbackReason: "hdr-format-unsupported",
      liveRenderTargetCount: 1
    });
  });

  it("destroys a failed HDR texture and retries LDR without a half-initialized Camera or RT", () => {
    reflectionMock.failHdrAllocation = true;
    const { service } = createService();
    service.setRequest(createRequest("high", { planarColorMode: "hdr-preferred" }));

    expect(() => service.update(0)).not.toThrow();

    expect(reflectionMock.createdTextureFormats).toEqual([35, 1]);
    expect(reflectionMock.textureDestroyCalls).toBe(1);
    expect(reflectionMock.renderTargetDestroyCalls).toBe(0);
    expect(reflectionMock.entityDestroyCalls).toBe(0);
    expect(service.getBinding("ocean")).toMatchObject({
      resolvedSource: "planar",
      planarColorFormat: "r8g8b8a8-unorm",
      planarHDR: false,
      planarColorFallbackReason: "hdr-target-failed"
    });
    expect(service.metrics).toMatchObject({
      fallbackReason: "hdr-target-failed",
      renderTargetCreateCount: 1,
      reflectionCameraCreateCount: 1,
      liveRenderTargetCount: 1,
      planarCameraCount: 1
    });

    service.destroy();
    expect(reflectionMock.textureDestroyCalls).toBe(2);
    expect(reflectionMock.renderTargetDestroyCalls).toBe(1);
    expect(reflectionMock.entityDestroyCalls).toBe(1);
  });

  it("keeps oblique clipping enabled by default and rerenders when the validation toggle changes", () => {
    const { service, sourceCamera } = createService();
    service.setRequest(createRequest("high", { obliqueClipEnabled: false }));
    service.update(0);

    const unclippedProjection = reflectionMock.lastRenderedProjection;
    expect(unclippedProjection).toEqual(sourceCamera.projectionMatrix.elements);

    service.setRequest(createRequest("high", { obliqueClipEnabled: true }));
    service.update(1);

    const clippedProjection = reflectionMock.lastRenderedProjection;
    expect(clippedProjection).toBeDefined();
    expect(clippedProjection).not.toEqual(unclippedProjection);
    expect(reflectionMock.renderCalls).toBe(2);
  });

  it("accepts a normalized general plane while preserving planeY compatibility", () => {
    const { service, sourceCamera } = createService();
    sourceCamera.entity.transform.worldForward.x = -0.5;
    sourceCamera.entity.transform.worldForward.y = 0;
    service.setRequest(
      createRequest("high", {
        planeY: undefined,
        plane: { normal: new Vector3(1, 0, 0), distance: 0 }
      })
    );

    service.update(0);

    expect(service.getBinding("ocean")).toMatchObject({ resolvedSource: "planar" });
    expect(reflectionMock.lastReflectionPosition).toEqual([-2, 5, 7]);
  });

  it("uses quarter resolution and skips unchanged Medium projection frames", () => {
    const { service } = createService();
    service.setRequest(createRequest("medium"));

    service.update(0);
    service.update(1);
    service.update(2);

    expect(reflectionMock.renderCalls).toBe(2);
    expect(service.metrics).toMatchObject({
      renderTargetWidth: 200,
      renderTargetHeight: 150,
      planarUpdateCount: 2,
      planarSkippedUpdateCount: 1
    });
  });

  it("forces Medium refresh for projection/viewport changes and balances resized targets", () => {
    const { service, sourceCamera } = createService();
    service.setRequest(createRequest("medium"));
    service.update(0);

    sourceCamera.fieldOfView = 70;
    service.update(1);
    sourceCamera.aspectRatio = 1.5;
    service.update(2);
    sourceCamera.nearClipPlane = 0.2;
    service.update(3);
    sourceCamera.farClipPlane = 450;
    service.update(4);
    sourceCamera.viewport.z = 0.75;
    service.update(5);
    service.setViewportSize(1000, 500);
    service.update(6);

    expect(reflectionMock.renderCalls).toBe(7);
    expect(reflectionMock.resetProjectionCalls).toBe(7);
    expect(service.metrics).toMatchObject({
      renderTargetWidth: 250,
      renderTargetHeight: 125,
      renderTargetCreateCount: 2,
      renderTargetDestroyCount: 1
    });
    service.destroy();
    expect(service.metrics.renderTargetCreateCount).toBe(service.metrics.renderTargetDestroyCount);
  });

  it.each([
    [
      "planar-orthographic-camera",
      (camera: Camera): void => {
        camera.isOrthographic = true;
      }
    ],
    [
      "planar-camera-too-close",
      (camera: Camera): void => {
        camera.entity.transform.worldPosition.y = 0.01;
      }
    ],
    [
      "planar-camera-underwater",
      (camera: Camera): void => {
        camera.entity.transform.worldPosition.y = -1;
      }
    ],
    [
      "planar-plane-back-facing",
      (camera: Camera): void => {
        camera.entity.transform.worldForward.y = 0.5;
      }
    ]
  ] as const)("falls back explicitly for %s", (fallbackReason, arrange) => {
    const { service, sourceCamera } = createService();
    service.setProbeTexture(new TextureCube({} as Engine, 4));
    arrange(sourceCamera);
    service.setRequest(createRequest("high"));

    service.update(0);

    expect(service.getBinding("ocean")).toMatchObject({ resolvedSource: "probe", fallbackReason });
    expect(service.metrics).toMatchObject({ planarCameraCount: 0, renderTargetCreateCount: 0 });
  });

  it("fails closed for invalid plane and numeric projection input", () => {
    const invalidPlane = createService();
    invalidPlane.service.setRequest(
      createRequest("high", { planeY: undefined, plane: { normal: new Vector3(0, 2, 0), distance: 0 } })
    );
    invalidPlane.service.update(0);
    expect(invalidPlane.service.getBinding("ocean")).toMatchObject({
      resolvedSource: "sky",
      fallbackReason: "planar-invalid-plane"
    });

    const invalidProjection = createService();
    invalidProjection.sourceCamera.fieldOfView = Number.NaN;
    invalidProjection.service.setRequest(createRequest("high"));
    invalidProjection.service.update(0);
    expect(invalidProjection.service.getBinding("ocean")).toMatchObject({
      resolvedSource: "sky",
      fallbackReason: "planar-invalid-projection"
    });
  });

  it("clears a stale planar binding as soon as its request becomes hidden", () => {
    const { service } = createService();
    service.setProbeTexture(new TextureCube({} as Engine, 4));
    service.setRequest(createRequest("high"));
    service.update(0);
    expect(service.getBinding("ocean")?.planarTexture).toBeDefined();

    service.setRequest(createRequest("high", { visible: false }));
    const hiddenBinding = service.getBinding("ocean");

    expect(hiddenBinding).toMatchObject({ resolvedSource: "probe", fallbackReason: "planar-not-visible" });
    expect(hiddenBinding?.planarTexture).toBeUndefined();
    expect(hiddenBinding?.planarViewProjection).toBeUndefined();
    service.update(1);
    expect(service.metrics).toMatchObject({
      planarCameraCount: 0,
      renderTargetCreateCount: 1,
      renderTargetDestroyCount: 1
    });
  });

  it("fails closed and releases the active target in the same call for invalid explicit arbitration data", () => {
    const { service } = createService();
    service.setRequest(createRequest("high"));
    service.update(0);
    const binding = service.getBinding("ocean");

    service.setRequest(createRequest("high", { screenAreaRatio: Number.NaN }));

    expect(binding).toMatchObject({ resolvedSource: "sky", fallbackReason: "planar-ineligible" });
    expect(binding?.planarTexture).toBeUndefined();
    expect(binding?.planarViewProjection).toBeUndefined();
    expect(service.metrics).toMatchObject({
      eligiblePlanarRequestCount: 0,
      selectedPlanarOwnerId: undefined,
      renderedPlanarOwnerId: undefined,
      planarCameraCount: 0,
      liveRenderTargetCount: 0,
      renderTargetCreateCount: 1,
      renderTargetDestroyCount: 1
    });
  });

  it("keeps the old texture live when challenger validation fails and atomically commits after recovery", () => {
    const { service } = createService();
    service.setProbeTexture(new TextureCube({} as Engine, 4));
    service.setRequest(createRequest("high", { id: "owner", priority: 1, screenAreaRatio: 0.2 }));
    service.update(0);
    service.setRequest(
      createRequest("high", {
        id: "challenger",
        priority: 2,
        screenAreaRatio: 0.4,
        planeY: undefined,
        plane: { normal: new Vector3(0, 2, 0), distance: 0 }
      })
    );

    service.update(1);
    expect(service.metrics).toMatchObject({
      selectedPlanarOwnerId: "owner",
      pendingPlanarOwnerId: "challenger",
      renderedPlanarOwnerId: "owner",
      planarOwnerSwitchCount: 0,
      pendingPlanarOwnerAgeFrames: 1
    });
    for (let frame = 2; frame < 30; frame++) service.update(frame);

    const oldBinding = service.getBinding("owner");
    service.update(30);

    const oldTexture = oldBinding?.planarTexture;
    const oldViewProjection = oldBinding?.planarViewProjection;
    expect(oldBinding).toMatchObject({ resolvedSource: "planar" });
    expect(oldTexture).toBeDefined();
    expect(oldViewProjection).toBeDefined();
    expect(service.metrics).toMatchObject({
      selectedPlanarOwnerId: "challenger",
      pendingPlanarOwnerId: "challenger",
      pendingPlanarOwnerAgeFrames: 1,
      pendingPlanarOwnerConfirmRemainingFrames: 0,
      renderedPlanarOwnerId: "owner",
      planarOwnerSwitchCount: 0,
      planarFailureCount: 1,
      liveRenderTargetCount: 1,
      renderTargetCreateCount: 1,
      renderTargetDestroyCount: 0
    });

    service.setRequest(createRequest("high", { id: "challenger", priority: 2, screenAreaRatio: 0.4, planeY: 0 }));
    service.update(31);

    expect(oldBinding).toMatchObject({ resolvedSource: "probe", fallbackReason: "planar-not-selected" });
    expect(oldBinding?.planarTexture).toBeUndefined();
    expect(oldBinding?.planarViewProjection).toBeUndefined();
    expect(service.getBinding("challenger")).toMatchObject({ resolvedSource: "planar" });
    expect(service.metrics).toMatchObject({
      planarOwnerId: "challenger",
      selectedPlanarOwnerId: "challenger",
      renderedPlanarOwnerId: "challenger",
      planarOwnerSwitchCount: 1,
      liveRenderTargetCount: 1,
      renderTargetCreateCount: 2,
      renderTargetDestroyCount: 1
    });
    expect(service.getBinding("challenger")?.planarTexture).not.toBe(oldTexture);
    expect(service.getBinding("challenger")?.planarViewProjection).not.toBe(oldViewProjection);
  });

  it("preserves the rendered owner through a challenger render failure, then swaps resources on success", () => {
    const { service } = createService();
    service.setProbeTexture(new TextureCube({} as Engine, 4));
    service.setRequest(createRequest("high", { id: "owner", priority: 1, screenAreaRatio: 0.2 }));
    service.update(0);
    const oldBinding = service.getBinding("owner");
    const oldTexture = oldBinding?.planarTexture;
    const oldViewProjection = oldBinding?.planarViewProjection;
    service.setRequest(createRequest("high", { id: "challenger", priority: 2, screenAreaRatio: 0.4 }));
    for (let frame = 1; frame < 30; frame++) service.update(frame);

    reflectionMock.failRender = true;
    service.update(30);
    reflectionMock.failRender = false;

    expect(oldBinding).toMatchObject({ resolvedSource: "planar" });
    expect(oldBinding?.planarTexture).toBe(oldTexture);
    expect(oldBinding?.planarViewProjection).toBe(oldViewProjection);
    expect(service.getBinding("challenger")).toMatchObject({
      resolvedSource: "probe",
      fallbackReason: "planar-render-failed"
    });
    expect(service.metrics).toMatchObject({
      selectedPlanarOwnerId: "challenger",
      pendingPlanarOwnerId: "challenger",
      pendingPlanarOwnerAgeFrames: 1,
      pendingPlanarOwnerConfirmRemainingFrames: 0,
      renderedPlanarOwnerId: "owner",
      planarFailureCount: 1,
      planarOwnerSwitchCount: 0,
      planarCameraCount: 1,
      liveRenderTargetCount: 1,
      renderTargetCreateCount: 2,
      renderTargetDestroyCount: 1,
      reflectionCameraCreateCount: 2,
      reflectionCameraDestroyCount: 1
    });

    service.setRequest(createRequest("high", { id: "challenger", priority: 2, screenAreaRatio: 0.4 }));
    service.update(31);

    expect(oldBinding).toMatchObject({ resolvedSource: "probe", fallbackReason: "planar-not-selected" });
    expect(oldBinding?.planarTexture).toBeUndefined();
    expect(service.getBinding("challenger")).toMatchObject({ resolvedSource: "planar" });
    expect(service.metrics).toMatchObject({
      selectedPlanarOwnerId: "challenger",
      pendingPlanarOwnerId: undefined,
      renderedPlanarOwnerId: "challenger",
      planarOwnerSwitchCount: 1,
      renderTargetCreateCount: 3,
      renderTargetDestroyCount: 2,
      liveRenderTargetCount: 1
    });
  });

  it("keeps the active camera and texture when challenger target allocation fails", () => {
    const { service } = createService();
    service.setProbeTexture(new TextureCube({} as Engine, 4));
    service.setRequest(createRequest("high", { id: "owner", priority: 1, screenAreaRatio: 0.2 }));
    service.update(0);
    const ownerBinding = service.getBinding("owner");
    const ownerTexture = ownerBinding?.planarTexture;
    service.setRequest(createRequest("high", { id: "challenger", priority: 2, screenAreaRatio: 0.4 }));
    for (let frame = 1; frame < 30; frame++) service.update(frame);

    reflectionMock.failAllocation = true;
    service.update(30);
    reflectionMock.failAllocation = false;

    expect(ownerBinding).toMatchObject({ resolvedSource: "planar" });
    expect(ownerBinding?.planarTexture).toBe(ownerTexture);
    expect(service.getBinding("challenger")).toMatchObject({
      resolvedSource: "probe",
      fallbackReason: "planar-target-failed"
    });
    expect(service.metrics).toMatchObject({
      selectedPlanarOwnerId: "challenger",
      pendingPlanarOwnerId: "challenger",
      renderedPlanarOwnerId: "owner",
      planarFailureCount: 1,
      planarCameraCount: 1,
      liveRenderTargetCount: 1,
      renderTargetCreateCount: 1,
      renderTargetDestroyCount: 0,
      reflectionCameraCreateCount: 1,
      reflectionCameraDestroyCount: 0
    });
  });

  it("reuses binding, camera, texture, and VP identities for 300 steady-state updates", () => {
    const { service } = createService();
    service.setRequest(createRequest("medium", { id: "steady" }));
    service.update(0);
    const binding = service.getBinding("steady");
    const texture = binding?.planarTexture;
    const viewProjection = binding?.planarViewProjection;

    for (let frame = 1; frame <= 300; frame++) service.update(frame);

    expect(service.getBinding("steady")).toBe(binding);
    expect(binding?.planarTexture).toBe(texture);
    expect(binding?.planarViewProjection).toBe(viewProjection);
    expect(service.metrics).toMatchObject({
      renderedPlanarOwnerId: "steady",
      planarCameraCount: 1,
      liveRenderTargetCount: 1,
      renderTargetCreateCount: 1,
      renderTargetDestroyCount: 0,
      reflectionCameraCreateCount: 1,
      reflectionCameraDestroyCount: 0
    });
  });

  it("clears lost-owner resources immediately and renders its replacement after the six-frame handoff", () => {
    const { service } = createService();
    service.setProbeTexture(new TextureCube({} as Engine, 4));
    service.setRequest(createRequest("high", { id: "owner", priority: 2, screenAreaRatio: 0.4 }));
    service.setRequest(createRequest("high", { id: "replacement", priority: 1, screenAreaRatio: 0.2 }));
    service.update(0);
    const ownerBinding = service.getBinding("owner");

    service.setRequest(createRequest("high", { id: "owner", priority: 2, screenAreaRatio: 0.4, visible: false }));

    expect(ownerBinding).toMatchObject({ resolvedSource: "probe", fallbackReason: "planar-not-visible" });
    expect(ownerBinding?.planarTexture).toBeUndefined();
    expect(ownerBinding?.planarViewProjection).toBeUndefined();
    expect(service.metrics).toMatchObject({
      planarOwnerId: undefined,
      selectedPlanarOwnerId: undefined,
      renderedPlanarOwnerId: undefined,
      planarCameraCount: 0,
      liveRenderTargetCount: 0,
      renderTargetCreateCount: 1,
      renderTargetDestroyCount: 1
    });

    for (let frame = 1; frame < 6; frame++) {
      service.update(frame);
      expect(service.metrics).toMatchObject({
        pendingPlanarOwnerId: "replacement",
        pendingPlanarOwnerAgeFrames: frame,
        renderedPlanarOwnerId: undefined,
        liveRenderTargetCount: 0
      });
    }
    service.update(6);

    expect(service.getBinding("replacement")).toMatchObject({ resolvedSource: "planar" });
    expect(service.metrics).toMatchObject({
      planarOwnerId: "replacement",
      selectedPlanarOwnerId: "replacement",
      renderedPlanarOwnerId: "replacement",
      planarOwnerSwitchCount: 1,
      renderTargetCreateCount: 2,
      renderTargetDestroyCount: 1,
      liveRenderTargetCount: 1
    });
  });

  it("balances 100 visibility, source, tier, and removal lifecycle cycles without stale bindings", () => {
    const { service } = createService();

    for (let cycle = 0; cycle < 100; cycle++) {
      service.setRequest(createRequest("high", { id: "stress", visible: true, preferredSource: "planar" }));
      service.update(cycle * 2);
      const binding = service.getBinding("stress");
      expect(binding?.planarTexture).toBeDefined();
      expect(binding?.planarViewProjection).toBeDefined();

      switch (cycle % 4) {
        case 0:
          service.setRequest(createRequest("high", { id: "stress", visible: false }));
          break;
        case 1:
          service.setRequest(createRequest("high", { id: "stress", preferredSource: "sky" }));
          break;
        case 2:
          service.setRequest(createRequest("low", { id: "stress" }));
          break;
        default:
          service.removeRequest("stress");
          break;
      }
      expect(binding?.planarTexture).toBeUndefined();
      expect(binding?.planarViewProjection).toBeUndefined();
      service.update(cycle * 2 + 1);
      expect(service.metrics).toMatchObject({ liveRenderTargetCount: 0, planarCameraCount: 0 });
    }

    expect(service.metrics).toMatchObject({
      activeConsumerCount: 0,
      planarOwnerId: undefined,
      renderedPlanarOwnerId: undefined,
      renderTargetCreateCount: 100,
      renderTargetDestroyCount: 100,
      reflectionCameraCreateCount: 100,
      reflectionCameraDestroyCount: 100,
      liveRenderTargetCount: 0,
      estimatedRenderTargetBytes: 0
    });
    expect(reflectionMock.renderTargetDestroyCalls).toBe(100);
    expect(reflectionMock.textureDestroyCalls).toBe(100);
  });

  it("keeps Low off planar and reports exact target/render failures without leaks", () => {
    const low = createService();
    low.service.setProbeTexture(new TextureCube({} as Engine, 4));
    low.service.setRequest(createRequest("low"));
    low.service.update(0);
    expect(low.service.getBinding("ocean")).toMatchObject({ resolvedSource: "probe", fallbackReason: "low-quality" });
    expect(low.service.metrics).toMatchObject({ planarCameraCount: 0, renderTargetCreateCount: 0 });

    const allocationFailure = createService();
    allocationFailure.service.setProbeTexture(new TextureCube({} as Engine, 4));
    allocationFailure.service.setRequest(createRequest("high"));
    reflectionMock.failAllocation = true;
    expect(() => allocationFailure.service.update(0)).not.toThrow();
    reflectionMock.failAllocation = false;
    expect(allocationFailure.service.getBinding("ocean")).toMatchObject({
      resolvedSource: "probe",
      fallbackReason: "planar-target-failed"
    });
    expect(allocationFailure.service.metrics).toMatchObject({ planarFailureCount: 1, renderTargetCreateCount: 0 });

    const renderFailure = createService();
    renderFailure.service.setProbeTexture(new TextureCube({} as Engine, 4));
    renderFailure.service.setRequest(createRequest("high"));
    reflectionMock.failRender = true;
    expect(() => renderFailure.service.update(0)).not.toThrow();
    reflectionMock.failRender = false;
    expect(renderFailure.service.getBinding("ocean")).toMatchObject({
      resolvedSource: "probe",
      fallbackReason: "planar-render-failed"
    });
    expect(renderFailure.service.metrics).toMatchObject({
      planarCameraCount: 0,
      planarFailureCount: 1,
      renderTargetCreateCount: 1,
      renderTargetDestroyCount: 1
    });
  });
});
