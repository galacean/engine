import { expect, it, vi } from "vitest";
const counters = vi.hoisted(() => ({ textures: 0, targets: 0, texturesDestroyed: 0, targetsDestroyed: 0 }));
vi.mock("@galacean/engine", () => ({
  Layer: { Layer31: 1 << 31 }, CameraClearFlags: { All: 7, Color: 1 }, AntiAliasing: { None: 0 }, Camera: class {},
  BackgroundMode: { SolidColor: 0 }, CompareFunction: { Less: 1, LessEqual: 2 }, DepthTextureMode: { None: 0 },
  TextureFormat: { R8G8B8A8: 0, R8G8B8A8_UNorm: 0, Depth24Stencil8: 1 },
  TextureFilterMode: { Point: 0 }, TextureWrapMode: { Clamp: 0 },
  Color: class { constructor(public r = 0, public g = 0, public b = 0, public a = 1) {} copyFrom(c: any) { Object.assign(this, c); } },
  Matrix: class {
    elements = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    static multiply() {}
    clone() { const m = new (this.constructor as any)(); m.elements.set(this.elements); return m; }
    invert() { return this; }
  },
  Vector3: class {
    constructor(public x = 0, public y = 0, public z = 0) {}
    clone() { return new (this.constructor as any)(this.x, this.y, this.z); }
  },
  Vector4: class {
    constructor(public x = 0, public y = 0, public z = 0, public w = 0) {}
    clone() { return new (this.constructor as any)(this.x, this.y, this.z, this.w); }
    set(x: number, y: number, z: number, w: number) { this.x = x; this.y = y; this.z = z; this.w = w; }
    copyFrom(v: any) { this.x = v.x; this.y = v.y; this.z = v.z; this.w = v.w; }
  },
  Shader: { find: () => ({}), create: () => ({}) },
  Material: class {
    shaderData = { setTexture() {}, setMatrix() {}, setVector4() {} };
    destroy() {}
  },
  Blitter: { blitTexture() {} },
  EngineEventType: { DeviceLost: "devicelost" },
  Renderer: class {}, Script: class {},
  Texture2D: class {
    constructor(public engine: any) { counters.textures++; }
    destroy() { counters.texturesDestroyed++; }
    getPixelBuffer(...args: any[]) { args.at(-1).fill(0); }
  },
  RenderTarget: class { constructor(_engine: any, public width: number, public height: number) { counters.targets++; } destroy() { counters.targetsDestroyed++; } }
}));
vi.mock("@galacean/engine-runtime-editor/runtime-inspection/runtime-pick-occlusion.ts", () => ({ RuntimePickOcclusion: class { prepare() {} restore() {} } }));
vi.mock("../src/world/SeedWorldFrameCapture", () => ({
  SeedWorldFrameCapture: class {
    request(onFrame: (photo: any) => any) {
      return Promise.resolve(onFrame({ width: 16, height: 12, dispose() {} }));
    }
    destroy() {}
  }
}));
import { SeedWorldPicker } from "../src/world/SeedWorldPicker";

it("reuses scratch capacity and restores camera, layers and materials after a render failure", async () => {
  const values = new Map([["material_WorldPickDepthCompare", 7]]), macros = new Set<string>();
  const material = { shaderData: { getFloat: (name: string) => values.get(name), setFloat: (name: string, value: number) => values.set(name, value) } };
  const sibling = { enabled: true };
  const entity = { layer: 1, children: [], getComponents: (_type: unknown, out: unknown[]) => { out.length = 0; out.push(sibling); } };
  const renderer = { entity, getMaterials: () => [material], shaderData: {
    setFloat() {}, enableMacro: (name: string) => macros.add(name), disableMacro: (name: string) => macros.delete(name)
  } };
  let calls = 0, throwAt = 1;
  let mainSsrWrites = 0;
  let mainSsrEnabled = true;
  let identityCamera: any;
  let identityCameraDestroyed = false;
  const scene: any = {
    rootEntities: [entity],
    ambientOcclusion: { enabled: true },
    background: { mode: 3, solidColor: { r: 1, g: 2, b: 3, a: 1 } },
    createRootEntity() {
      const auxTransform: any = { worldPosition: {}, worldRotationQuaternion: {} };
      const auxCamera: any = {
        entity: {
          transform: auxTransform,
          destroy() {
            identityCameraDestroyed = true;
          }
        },
        engine: camera.engine,
        scene,
        enabled: true,
        enableScreenSpaceReflection: true,
        updateRendererVisibility: true,
        registerRenderViewCullingSource() {},
        projectionMatrix: { clone() { return this; } },
        viewport: { clone: () => ({}), set() {}, copyFrom() {} },
        resetProjectionMatrix() {},
        renderTarget: null,
        clearFlags: 9,
        cullingMask: -1,
        enableHDR: true,
        enablePostProcess: true,
        opaqueTextureEnabled: true,
        antiAliasing: 4,
        depthTextureMode: 2,
        render() {
          if (++calls === throwAt) throw new Error("render failed");
        }
      };
      identityCamera = auxCamera;
      return { addComponent: () => auxCamera };
    }
  };
  const camera: any = {
    entity: { transform: { worldPosition: { x: 1, y: 2, z: 3 }, worldForward: { x: 0, y: 0, z: -1 }, worldRotationQuaternion: {} } },
    engine: { canvas: { width: 10, height: 10 } }, scene,
    projectionMatrix: { clone() { return this; } }, viewport: { clone: () => ({}), set() {}, copyFrom() {} }, resetProjectionMatrix() {},
    renderTarget: null, clearFlags: 9, cullingMask: -1, enableHDR: true, enablePostProcess: true,
    opaqueTextureEnabled: true, antiAliasing: 4, depthTextureMode: 2,
    get enableScreenSpaceReflection() {
      return mainSsrEnabled;
    },
    set enableScreenSpaceReflection(value: boolean) {
      mainSsrWrites++;
      mainSsrEnabled = value;
    },
    render() { if (++calls === throwAt) throw new Error("render failed"); }
  };
  const batch: any = { renderer, count: 1, resolve() {}, prepare: vi.fn(), restore: vi.fn() };
  function visit(visitor: any) { visitor(batch); }
  const picker: any = new SeedWorldPicker(camera);
  expect(() => picker.render(visit, { width: 10, height: 10, consume() {} })).toThrow("render failed");
  expect(batch.restore).toHaveBeenCalledTimes(1);
  expect(sibling.enabled).toBe(true);
  expect(entity.layer).toBe(1);
  expect(values.get("material_WorldPickDepthCompare")).toBe(7);
  expect(macros.size).toBe(0);
  expect(camera).toMatchObject({ renderTarget: null, clearFlags: 9, cullingMask: -1, enableHDR: true, enablePostProcess: true, antiAliasing: 4, depthTextureMode: 2, enableScreenSpaceReflection: true });
  mainSsrWrites = 0;
  throwAt = calls + 1;
  expect(() => picker.captureIdentity(visit, () => undefined, {width:10,height:10})).toThrow("render failed");
  expect(mainSsrWrites).toBe(0);
  expect(camera).toMatchObject({ renderTarget: null, clearFlags: 9, cullingMask: -1, enableHDR: true, enablePostProcess: true, enableScreenSpaceReflection: true });
  expect(identityCamera.enableScreenSpaceReflection).toBe(false);
  expect(entity.layer).toBe(1);
  expect(macros.size).toBe(0);
  throwAt = -1;
  picker.render(visit, { width: 10, height: 10, consume() {} }); // A failed capture releases scratch attachments; the next identity render re-establishes them.
  const record = picker.bindings[0], textures = counters.textures, targets = counters.targets;
  for (let i = 0; i < 20; i++) picker.render(visit, { width: 10, height: 10, consume() {} });
  expect(picker.bindings[0]).toBe(record);
  expect(record.batch).toBeUndefined();
  expect(picker.materials[0]).toBeUndefined();
  expect(counters.textures).toBe(textures); expect(counters.targets).toBe(targets);
  camera.engine.canvas = { width: 3840, height: 2160 };
  mainSsrWrites = 0;
  identityCamera.render = () => {
    expect(camera.enableScreenSpaceReflection).toBe(true);
    expect(identityCamera.enableScreenSpaceReflection).toBe(false);
    expect(identityCamera.renderTarget).toMatchObject({ width: 768, height: 432 });
    throw new Error("bounded snapshot");
  };
  expect(() => picker.captureIdentity(visit, () => undefined, {width:768,height:432})).toThrow("bounded snapshot");
  expect(mainSsrWrites).toBe(0);
  expect(camera.renderTarget).toBe(null);
  expect(identityCamera.renderTarget).toBe(null);
  picker.dispose();
  expect(identityCameraDestroyed).toBe(true);
});

it("replays the frozen camera pose, projection, and visible render-view batches when deferred identity capture runs after the camera moves", async () => {
  const cloneableVec3 = (x: number, y: number, z: number) => ({
    x,
    y,
    z,
    clone() {
      return cloneableVec3(this.x, this.y, this.z);
    }
  });
  const cloneableQuat = (x: number, y: number, z: number, w: number) => ({
    x,
    y,
    z,
    w,
    clone() {
      return cloneableQuat(this.x, this.y, this.z, this.w);
    }
  });
  const cloneableMat = (tx: number) => {
    const elements = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, tx, 0, 0, 1]);
    const mat: any = {
      elements,
      clone() {
        return cloneableMat(this.elements[12]!);
      },
      invert() {
        return this;
      }
    };
    return mat;
  };
  const cloneableViewport = (x: number, y: number, z: number, w: number) => ({
    x,
    y,
    z,
    w,
    clone() {
      return cloneableViewport(this.x, this.y, this.z, this.w);
    },
    set(nx: number, ny: number, nz: number, nw: number) {
      this.x = nx;
      this.y = ny;
      this.z = nz;
      this.w = nw;
    },
    copyFrom(v: any) {
      this.x = v.x;
      this.y = v.y;
      this.z = v.z;
      this.w = v.w;
    }
  });

  const capturedRendererA: any = { id: "captured-tree", destroyed: false, enabled: true, bounds: {} };
  const movedRendererB: any = { id: "moved-rock", destroyed: false, enabled: true, bounds: {} };
  let liveRenderViewRenderers: any[] = [capturedRendererA];
  let cullingSource: { cull(ctx: any): void } | undefined;
  let observedPositionAtRender: any;
  let observedCulledRenderers: any[] = [];
  let identityCamera: any;

  const scene: any = {
    rootEntities: [],
    ambientOcclusion: { enabled: false },
    castShadows: true,
    background: { mode: 0, solidColor: { r: 0, g: 0, b: 0, a: 1 } },
    createRootEntity() {
      const auxTransform: any = { worldPosition: cloneableVec3(0, 0, 0), worldRotationQuaternion: cloneableQuat(0, 0, 0, 1) };
      const auxCamera: any = {
        entity: { transform: auxTransform, destroy() {} },
        engine: mainCamera.engine,
        scene,
        enabled: false,
        enableScreenSpaceReflection: false,
        updateRendererVisibility: false,
        nearClipPlane: 0.1,
        farClipPlane: 100,
        fieldOfView: 45,
        aspectRatio: 1.5,
        isOrthographic: false,
        orthographicSize: 10,
        cullingMask: -1,
        projectionMatrix: cloneableMat(0),
        get viewMatrix() {
          return cloneableMat(this.entity.transform.worldPosition.x);
        },
        viewport: cloneableViewport(0, 0, 1, 1),
        resetProjectionMatrix() {},
        registerRenderViewCullingSource(src: { cull(ctx: any): void }) {
          cullingSource = src;
        },
        renderTarget: null,
        clearFlags: 7,
        enableHDR: false,
        enablePostProcess: false,
        opaqueTextureEnabled: false,
        antiAliasing: 0,
        depthTextureMode: 0,
        render() {
          observedPositionAtRender = { ...auxTransform.worldPosition };
          observedCulledRenderers = [];
          cullingSource?.cull({
            isVisible: () => true,
            submit: (r: any) => observedCulledRenderers.push(r)
          });
        }
      };
      identityCamera = auxCamera;
      return { addComponent: () => auxCamera };
    }
  };

  const mainCamera: any = {
    entity: {
      transform: {
        worldPosition: cloneableVec3(10, 5, 20),
        worldForward: cloneableVec3(0, 0, -1),
        worldRotationQuaternion: cloneableQuat(0, 0.25, 0, 0.968)
      },
      addComponent: (Ctor: any) => new Ctor()
    },
    engine: {
      canvas: { width: 16, height: 12 },
      _renderContext: { camera: null, flipProjection: false },
      on() {},
      off() {}
    },
    scene,
    nearClipPlane: 0.2,
    farClipPlane: 250,
    fieldOfView: 60,
    aspectRatio: 16 / 12,
    isOrthographic: false,
    orthographicSize: 10,
    cullingMask: -1,
    projectionMatrix: cloneableMat(42),
    get viewMatrix() {
      return cloneableMat(this.entity.transform.worldPosition.x);
    },
    viewport: cloneableViewport(0, 0, 1, 1),
    visitRenderViewRenderers(visitor: (renderer: any) => void) {
      for (const r of liveRenderViewRenderers) visitor(r);
    }
  };

  const picker = new SeedWorldPicker(mainCamera);
  const colorFrame = await picker.captureColorOnly();

  // Simulate world unfreeze & main camera moving away before deferred identity capture runs.
  mainCamera.entity.transform.worldPosition.x = 999;
  mainCamera.entity.transform.worldPosition.z = -500;
  mainCamera.entity.transform.worldForward.x = 1;
  mainCamera.entity.transform.worldForward.z = 0;
  mainCamera.projectionMatrix = cloneableMat(777);
  liveRenderViewRenderers = [movedRendererB];

  const populated = picker.captureIdentityBuffer(
    () => {},
    () => ({ entityId: 1, componentId: 1, componentType: "MeshRenderer" }),
    colorFrame.image,
    undefined,
    colorFrame.capturedView
  );

  expect(observedPositionAtRender).toMatchObject({ x: 10, y: 5, z: 20 });
  expect(observedCulledRenderers).toEqual([capturedRendererA]);
  expect(populated.metadata?.viewer.position).toEqual([10, 5, 20]);
  expect(populated.metadata?.viewer.forward).toEqual([0, 0, -1]);
  expect(identityCamera.entity.transform.worldPosition).toMatchObject({ x: 10, y: 5, z: 20 });
  populated.identities.dispose();
  picker.dispose();
});
