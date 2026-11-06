import { constructionAssets } from "./fixtures/constructionAssets";
import { buildingAssets } from "../src/tiny-glade/resources/BuildingAssetKit";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Camera, Engine, Entity } from "@galacean/engine";
import type { ConstructionDecorationStone } from "../src/tiny-glade/runtime/ConstructionDecorations";
const mock = vi.hoisted(() => ({
  frame: vi.fn(),
  load: vi.fn(),
  created: vi.fn(),
  builder: vi.fn(),
  appendWood: vi.fn((base: unknown, _parts: unknown, _globals: unknown) => base),
  pillars: vi.fn(),
  scene: undefined as any
}));
vi.mock("../src/tiny-glade/runtime/ConstructionWoodArchRender", () => ({
  appendWoodArchRenderPackage: mock.appendWood,
  addWoodArchPillarDraws: mock.pillars
}));
vi.mock("../src/tiny-glade/runtime/BuildingGlobals", () => ({ buildingGlobals: () => ({}) }));
vi.mock("../src/tiny-glade/runtime/DecorationStoneInstance", () => ({
  packDecorationStoneInstances: () => new Uint8Array(128)
}));
vi.mock("../src/tiny-glade/runtime/ConstructionPackage", () => ({
  ConstructionPackageBuilder: class {
    constructor(private assets: unknown, ...args: unknown[]) { mock.builder(assets,...args); }
    addDraw() {}
    build() {
      return { package: { nativeAssets:this.assets, draws: [], programs: {} }, dynamicFiles: [], asset: vi.fn() };
    }
  }
}));
vi.mock("../src/tiny-glade/runtime/EngineResidentScene", () => ({
  EngineResidentScene: class {
    root = { isActive: true, isActiveInHierarchy: false };
    draws = new Map([
      ["hat", { ownerId: "house", enabled: true, renderer: { enabled: true, entity: { isActive: true } }, lodRenderer: { enabled: false, entity: { isActive: true } } }]
    ]);
    metrics = { fullTriangles: 236 };
    load = mock.load;
    destroy = vi.fn();
    bindCamera = vi.fn();
    setLodStates = vi.fn();
    setEntrance = vi.fn();
    constructor() {
      mock.scene = this;
      mock.created();
    }
  }
}));
import { createDecorationNativeView } from "../src/tiny-glade/runtime/DecorationNativeView";
const assets = constructionAssets();
const stone = {
  id: "hat",
  ownerId: "house",
  template: "window_gothic_1x1_hat",
  instance: {}
} as ConstructionDecorationStone;
const engine = {} as Engine,
  parent = {} as Entity,
  camera = {} as Camera;
const deferred = () => {
  let resolve!: () => void, reject!: (reason: unknown) => void;
  const promise = new Promise<void>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
describe("native decoration persistent view publication lifetime", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.frame.mockResolvedValue(new ArrayBuffer(352));
    mock.load.mockResolvedValue(undefined);
    mock.scene = undefined;
  });

  it("retains a removed owner's visibility across an asynchronous load and can restore it", async () => {
    const wait = deferred(); mock.load.mockReturnValue(wait.promise);
    const view = createDecorationNativeView(engine, parent, [stone], [], {assets});
    view.setOwnerVisible("house", false);
    await vi.waitFor(() => expect(mock.load).toHaveBeenCalled()); wait.resolve(); await view.ready;
    const draw = mock.scene.draws.get("hat");
    expect(draw.renderer.entity.isActive).toBe(false); expect(draw.lodRenderer.entity.isActive).toBe(false);
    view.setOwnerVisible("house", true);
    expect(draw.renderer.entity.isActive).toBe(true); expect(draw.lodRenderer.entity.isActive).toBe(true);
    view.destroy();
  });
  it("consumes already-loaded native Prefab resources without a second static read", async () => {
    const view=createDecorationNativeView(engine,parent,[stone],[],{assets});
    await view.ready;expect(mock.frame).not.toHaveBeenCalled();
    expect(mock.builder).toHaveBeenCalledWith(buildingAssets(assets),{});view.destroy();
  });
  it("keeps late GPU allocations owned until a canceled load settles", async () => {
    const wait = deferred();
    mock.load.mockReturnValue(wait.promise);
    const view = createDecorationNativeView(engine, parent, [stone], [], {assets});
    await vi.waitFor(() => expect(mock.load).toHaveBeenCalled());
    view.destroy();
    expect(mock.scene.root.isActive).toBe(false);
    expect(mock.scene.destroy).not.toHaveBeenCalled();
    wait.resolve();
    await view.ready;
    expect(mock.scene.destroy).toHaveBeenCalledTimes(1);
    expect(mock.scene.root.isActive).toBe(false);
  });
  it("publishes the latest fade and entrance state, and exposes ownership while its candidate parent is inactive", async () => {
    const wait = deferred();
    mock.load.mockReturnValue(wait.promise);
    const view = createDecorationNativeView(engine, parent, [stone], [], { assets, camera });
    view.setFade(-0.6);
    const state = { progress: 0.4, minimumY: 2, height: 8 };
    view.setEntrance(new Map([["house", state]]));
    state.progress = 1;
    await vi.waitFor(() => expect(mock.load).toHaveBeenCalled());
    wait.resolve();
    await view.ready;
    expect(mock.scene.bindCamera).toHaveBeenCalledWith(camera);
    expect(mock.scene.setLodStates).toHaveBeenLastCalledWith([{ lodIndex: 0, signedFade: -0.6 }]);
    expect(mock.scene.setEntrance.mock.lastCall[0].get("house").progress).toBe(0.4);
    const visit = vi.fn();
    view.visitRenderers(visit);
    expect(visit).toHaveBeenCalledWith(mock.scene.draws.get("hat").renderer, "house", mock.scene.draws.get("hat"));
    view.destroy();
    view.destroy();
    expect(mock.scene.destroy).toHaveBeenCalledTimes(1);
    expect(view.triangles).toBe(236);
  });
  it("loads wooden-only decorations through the same owned resident scene", async () => {
    // This test verifies lifetime/forwarding only. Real package ABI is exercised
    // by WoodArchRender and ConstructionArchIntegration with original assets.
    const woodArchFrames = [{ id: "beam", ownerId: "house" }] as any;
    const woodArchPillars = [{ id: "pillar", ownerId: "house" }] as any;
    const view = createDecorationNativeView(engine, parent, [], [], { assets, woodArchFrames, woodArchPillars });
    await view.ready;
    expect(mock.pillars.mock.calls[0][1]).toBe(woodArchPillars);
    expect(mock.appendWood.mock.calls[0][1]).toBe(woodArchFrames);
    expect(mock.load).toHaveBeenCalledTimes(1);
    view.destroy();
    expect(mock.scene.destroy).toHaveBeenCalledTimes(1);
  });
  it("packs standalone decoration appearance with the same tint contract as attached parts", async () => {
    const view = createDecorationNativeView(engine, parent, [], [], { assets,
      parts: [
        {
          id: "lamp",
          ownerId: "ground:lamp",
          kind: "lantern",
          tintRole: "wooden_plank",
          positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
          normals: [0, 0, 1, 0, 0, 1, 0, 0, 1],
          colors: [0.5, 0.3, 0.2, 0.5, 0.3, 0.2, 0.5, 0.3, 0.2],
          emission: [0, 0, 0],
          indices: [0, 1, 2]
        }
      ]
    });
    await view.ready;
    const pack = mock.load.mock.lastCall![0];
    expect(pack.whiteBase).toBe(true);
    expect(pack.draws[0].attributes.some((a: { location: number }) => a.location === 7)).toBe(true);
    expect(pack.programs[pack.draws[0].program].frag.source).toContain("vertexTintRole");
    view.destroy();
  });
  it("registers both LOD renderers before the first camera dispatch, retaining ownership after a later LOD switch", async () => {
    const view = createDecorationNativeView(engine, parent, [stone], [], {assets});
    await view.ready;
    const draw = mock.scene.draws.get("hat");
    draw.renderer.enabled = false;
    draw.lodRenderer.enabled = false;
    const registered: { renderer: { enabled: boolean }; owner: string }[] = [];
    view.visitRenderers((renderer, owner) => registered.push({ renderer, owner }));
    expect(registered.map((p) => p.renderer)).toEqual([draw.renderer, draw.lodRenderer]);
    draw.renderer.enabled = true;
    expect(registered.filter((p) => p.renderer.enabled).map((p) => p.owner)).toEqual(["house"]);
    draw.renderer.enabled = false;
    draw.lodRenderer.enabled = true;
    expect(registered.filter((p) => p.renderer.enabled).map((p) => p.owner)).toEqual(["house"]);
    view.destroy();
    const after = vi.fn();
    view.visitRenderers(after);
    expect(after).not.toHaveBeenCalled();
  });
  it("rejects a live load failure instead of publishing an empty decoration", async () => {
    mock.load.mockRejectedValue(new Error("GPU allocation failed"));
    const view = createDecorationNativeView(engine, parent, [stone], [], {assets});
    await expect(view.ready).rejects.toThrow("GPU allocation failed");
    expect(mock.scene.root.isActive).toBe(false);
    expect(mock.scene.destroy).toHaveBeenCalledTimes(1);
  });

it("passes the selected native Prefab resources into the coarse renderer without builtin overlays", async () => {
  const view = createDecorationNativeView(engine, parent, [stone], [], {assets});
  await view.ready;
  expect(mock.builder).toHaveBeenCalledWith(buildingAssets(assets), {});
  view.destroy();
});

});
