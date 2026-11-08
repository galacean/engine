import { expect, it, vi } from "vitest";
const counters = vi.hoisted(() => ({ textures: 0, targets: 0, texturesDestroyed: 0, targetsDestroyed: 0 }));
vi.mock("@galacean/engine", () => ({
  Layer: { Layer31: 1 << 31 }, CameraClearFlags: { All: 7, Color: 1 }, AntiAliasing: { None: 0 },
  BackgroundMode: { SolidColor: 0 }, CompareFunction: { Less: 1, LessEqual: 2 }, DepthTextureMode: { None: 0 },
  ScreenSpaceReflectionActivationMode: { ForceOff: 0 }, TextureFormat: { R8G8B8A8: 0, Depth24Stencil8: 1 },
  TextureFilterMode: { Point: 0 }, TextureWrapMode: { Clamp: 0 },
  Color: class { constructor(public r = 0, public g = 0, public b = 0, public a = 1) {} copyFrom(c: any) { Object.assign(this, c); } },
  Matrix: class { static multiply() {} invert() {} }, Vector3: class {}, Renderer: class {},
  Texture2D: class { constructor() { counters.textures++; } destroy() { counters.texturesDestroyed++; } getPixelBuffer(...args: any[]) { args.at(-1).fill(0); } },
  RenderTarget: class { constructor(_engine: any, public width: number, public height: number) { counters.targets++; } destroy() { counters.targetsDestroyed++; } }
}));
vi.mock("@galacean/engine-runtime-editor/runtime-inspection/runtime-pick-occlusion.ts", () => ({ RuntimePickOcclusion: class { prepare() {} restore() {} } }));
vi.mock("../src/world/SeedWorldFrameCapture", () => ({ SeedWorldFrameCapture: class {} }));
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
  const camera: any = {
    entity: { transform: { worldPosition: { x: 1, y: 2, z: 3 }, worldForward: { x: 0, y: 0, z: -1 } } },
    engine: { canvas: { width: 10, height: 10 } }, scene: { rootEntities: [entity], ambientOcclusion: { enabled: true }, background: { mode: 3, solidColor: { r: 1, g: 2, b: 3, a: 1 } } },
    projectionMatrix: { clone() { return this; } }, viewport: { clone: () => ({}), set() {}, copyFrom() {} }, resetProjectionMatrix() {},
    renderTarget: null, clearFlags: 9, cullingMask: -1, enableHDR: true, enablePostProcess: true,
    opaqueTextureEnabled: true, antiAliasing: 4, depthTextureMode: 2, screenSpaceReflection: { activationMode: 5 },
    render() { if (++calls === throwAt) throw new Error("render failed"); }
  };
  const batch: any = { renderer, count: 1, resolve() {}, prepare: vi.fn(), restore: vi.fn() };
  function visit(visitor: any) { visitor(batch); }
  const picker: any = new SeedWorldPicker(camera);
  expect(() => picker.pick(1, 1, visit)).toThrow("render failed");
  expect(batch.restore).toHaveBeenCalledTimes(1);
  expect(sibling.enabled).toBe(true);
  expect(entity.layer).toBe(1);
  expect(values.get("material_WorldPickDepthCompare")).toBe(7);
  expect(macros.size).toBe(0);
  expect(camera).toMatchObject({ renderTarget: null, clearFlags: 9, cullingMask: -1, enableHDR: true, enablePostProcess: true, antiAliasing: 4, depthTextureMode: 2 });
  throwAt = calls + 1;
  expect(() => picker.captureIdentity(visit, () => undefined, {width:10,height:10})).toThrow("render failed");
  expect(camera).toMatchObject({ renderTarget: null, clearFlags: 9, cullingMask: -1, enableHDR: true, enablePostProcess: true });
  expect(entity.layer).toBe(1);
  expect(macros.size).toBe(0);
  throwAt = -1;
  picker.warmup(visit); // A failed capture releases scratch attachments; warmup re-establishes them.
  const record = picker.bindings[0], textures = counters.textures, targets = counters.targets;
  for (let i = 0; i < 20; i++) picker.warmup(visit);
  expect(picker.bindings[0]).toBe(record);
  expect(record.batch).toBeUndefined();
  expect(picker.materials[0]).toBeUndefined();
  expect(counters.textures).toBe(textures); expect(counters.targets).toBe(targets);
  camera.engine.canvas = { width: 3840, height: 2160 };
  camera.render = () => {
    expect(camera.renderTarget).toMatchObject({ width: 768, height: 432 });
    throw new Error("bounded snapshot");
  };
  expect(() => picker.captureIdentity(visit, () => undefined, {width:768,height:432})).toThrow("bounded snapshot");
  expect(camera.renderTarget).toBe(null);
  picker.dispose();
});
