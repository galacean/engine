import "../src/tiny-glade/parts/supports/PointSupport";
import "../src/tiny-glade/parts/algorithms/PlaceAtPoint";
import { BuildingGroupComponent } from "../src/tiny-glade/parts/architecture/BuildingGroupComponent";
import { afterEach, expect, it, vi } from "vitest";
import { Matrix, Entity, Scene, MeshRenderer, type Engine } from "@galacean/engine";
import { BuildingManager } from "../src/tiny-glade/parts/architecture/BuildingManager";
import { BuildingPartComponent } from "../src/tiny-glade/parts/architecture/BuildingPartComponent";

const scenes: Scene[] = [];
const engine = {
  canvas: { width: 800, height: 600 },
  resourceManager: { _deleteAsset() {}, _deleteContentRestorer() {}, _addReferResource() {}, _deleteReferResource() {} }
} as unknown as Engine;

/** No GPU is needed for membership. Use the native Scene root operations and
 * Entity/Component activation/destruction, with only rendering initialization
 * and script scheduling omitted. Source round-trips are covered separately. */
function scene(active = true) {
  const result = Object.assign(Object.create(Scene.prototype), {
    _engine: engine,
    _rootEntities: [],
    _isActiveInEngine: active,
    _componentsManager: {
      getActiveChangedTempList: () => [],
      putActiveChangedTempList() {},
      addOnStartScript() {},
      removeOnStartScript() {},
      addOnUpdateScript() {},
      removeOnUpdateScript() {},
      addOnLateUpdateScript() {},
      removeOnLateUpdateScript() {},
      addRenderer() {},
      removeRenderer() {}
    }
  }) as Scene;
  scenes.push(result);
  return result;
}
afterEach(() => {
  for (const s of scenes.splice(0)) for (const root of [...s.rootEntities]) root.destroy();
});

function setup() {
  const s = scene(),
    m = BuildingManager.forScene(s);
  m.bind({
    camera: {
      engine,
      destroyed: false,
      entity: s.createRootEntity("camera"),
      viewMatrix: new Matrix(),
      projectionMatrix: new Matrix(),
      viewport: { z: 1, w: 1 },
      nearClipPlane: 0.1,
      farClipPlane: 100,
      isOrthographic: false
    } as any
  });
  return { s, m };
}

const upload = vi.hoisted(() => ({
  gate: undefined as Promise<void> | undefined,
  entered: undefined as (() => void) | undefined
}));
vi.mock("../src/tiny-glade/parts/architecture/BuildingRender", () => ({
  renderBuilding: async (_input: unknown, options: any) => {
    const root = options.parent.createChild("native-render-output");
    upload.entered?.();
    await upload.gate;
    return { runtime: { root, draws: new Map() }, destroy: () => root.destroy() };
  }
}));
import { European } from "../src/tiny-glade/parts/architecture/European";
import { designBuilding } from "../src/tiny-glade/parts/architecture/BuildingDesign";
import {
  prepareBuildingPublication,
  buildingPreviewInput,
  buildingFocusPoses
} from "../src/tiny-glade/parts/architecture/BuildingPublication";
import { profilePreview } from "../src/tiny-glade/runtime/ProfilePreview";
import { prepareBuildingCpu } from "../src/tiny-glade/parts/architecture/BuildingCpu";
import { constructionAssets, nativeAssets } from "./fixtures/constructionAssets";
import { buildingDraftSource } from "../src/tiny-glade/parts/architecture/BuildingSource";
import { copyBuildingPrefab } from "../src/tiny-glade/components/BuildingPrefab";
import { buildingInstanceKey } from "../src/tiny-glade/parts/architecture/BuildingRuntime";
import { buildingPartKey } from "../src/tiny-glade/runtime/BuildingObjectIdentity";

const house = (foundation = 0) =>
  European.buildHouses({
    id: "house",
    height: 14,
    foundation: { height: foundation },
    attachments: [
      {
        id: "window",
        kind: "window",
        type: "window-cottage",
        host: "wall",
        u: 0.35,
        bottom: 8,
        width: 1.2,
        height: 1.5,
        rank: 1,
        seed: 17
      }
    ]
  });
it.each(["flat", "elevated", "slope", "foundation"])(
  "publishes solved %s focus without changing render geometry",
  async (kind) => {
    const draft = house(kind === "foundation" ? 2 : 0);
    const ground = (x: number, z: number) => (kind === "flat" ? 0 : kind === "slope" ? 10 + x * 0.1 + z * 0.05 : 10);
    const design = designBuilding(draft, ground, nativeAssets.compilation);
    expect(design.diagnostics).toEqual([]);
    const publication = await prepareBuildingPublication(design);
    const preview = profilePreview(buildingPreviewInput(design, publication), ground, {
      assets: nativeAssets.compilation
    });
    const before = structuredClone(preview);
    const focus = buildingFocusPoses(design, preview.parts);
    expect(focus.find((p) => p.part === "house/window")!.position).toEqual(
      design.prepared.decorations[0].mounts[0].mount.origin
    );
    expect(focus.find((p) => p.part === "house-wall")).toBeDefined();
    expect(focus.find((p) => p.part === "house-roof")).toBeDefined();
    expect(preview).toEqual(before);
  }
);
it("transfers the same solved mount from Worker preparation", async () => {
  const draft = house();
  const cpu = await prepareBuildingCpu(
    draft,
    { samples: new Uint16Array(4), resolution: 2, origin: [-50, -50], size: 100, decode: { offset: 10, scale: 1 } },
    nativeAssets.compilation
  );
  const response = structuredClone(cpu.focus);
  expect(response.find((p) => p.part === "house/window")!.position).toEqual(
    cpu.prepared.design.prepared.decorations[0].mounts[0].mount.origin
  );
  expect(response.find((p) => p.part === "house/window")!.position[1]).toBeCloseTo(18.75);
});
it("keeps focus with the accepted snapshot through failure, instance copy and recovery", async () => {
  const { s, m } = setup(),
    library = constructionAssets();
  Object.defineProperty(library, "engine", { value: engine });
  m.assets = library;
  m.terrain = () => 10;
  const draft = house(),
    fragment = buildingDraftSource(draft, { id: "house-wall" });
  const copied = copyBuildingPrefab(
    JSON.parse(
      JSON.stringify({
        asset: { version: "2.0" },
        root: "house-wall",
        entities: fragment.entities,
        components: fragment.components
      })
    ),
    "copy"
  );
  const reload = {
    groups: copied.components.filter((c) => c.type === "BuildingGroupComponent").map((c) => c.props!.definition),
    parts: copied.components.filter((c) => c.type === "BuildingPartComponent").map((c) => c.props!.definition),
    relations: copied.components
      .filter((c) => c.type === "BuildingPartComponent")
      .flatMap((c) => c.props!.relations as any[])
  } as any;
  const a = m.create(s.createRootEntity("a"), draft),
    b = m.create(s.createRootEntity("b"), reload);
  b.transform.setPosition(20, 0, 0);
  b.transform.setRotation(0, 90, 0);
  const p = m.get("house/window", a)!,
    q = m.get("house/window", b)!;
  expect(m.partView(p)).toBeUndefined();
  await m.flushAsync();
  const initial = m.partView(p)!,
    other = m.partView(q)!;
  expect(initial.position.y).toBeCloseTo(18.75);
  const expected = initial.position.clone();
  const { Vector3 } = await import("@galacean/engine");
  Vector3.transformCoordinate(expected, b.transform.worldMatrix, expected);
  expect(other.position).toEqual(expected);
  expect(m.resolve(buildingInstanceKey(a, buildingPartKey("house/window")))).toBe(p);
  expect(m.resolve(buildingInstanceKey(b, buildingPartKey("house/window")))).toBe(q);
  const definition = p.definition!;
  p.definition = {
    ...definition,
    support: {
      ...definition.support,
      params: { ...definition.support.params, spec: { ...definition.support.params.spec, bottom: 100 } }
    }
  };
  expect(m.partView(p)).toEqual(initial);
  await expect(m.flushAsync()).rejects.toThrow();
  expect(m.partView(p)).toEqual(initial);
  expect(m.partView(q)).toEqual(other);
  p.definition = {
    ...definition,
    support: {
      ...definition.support,
      params: { ...definition.support.params, spec: { ...definition.support.params.spec, bottom: 9 } }
    }
  };
  await m.flushAsync();
  expect(m.partView(p)!.position.y).toBeCloseTo(19.75);
  expect(m.partView(q)).toEqual(other);
  let release!: () => void, entered!: () => void;
  const waiting = new Promise<void>((resolve) => {
    entered = resolve;
  });
  upload.gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  upload.entered = entered;
  const accepted = m.partView(p)!;
  const change = (bottom: number) => {
    p.definition = {
      ...definition,
      support: {
        ...definition.support,
        params: { ...definition.support.params, spec: { ...definition.support.params.spec, bottom } }
      }
    };
  };
  change(9.5);
  const pending = m.flushAsync();
  await waiting;
  expect(m.partView(p)).toEqual(accepted);
  change(10);
  upload.gate = undefined;
  upload.entered = undefined;
  release();
  await pending;
  await m.flushAsync();
  expect(m.partView(p)!.position.y).toBeCloseTo(20.75);
  expect(m.partView(q)).toEqual(other);
  p.enabled = false;
  await m.flushAsync();
  expect(m.partView(p)).toBeUndefined();
  p.enabled = true;
  await m.flushAsync();
  expect(m.partView(p)!.position.y).toBeCloseTo(20.75);
  a.destroy();
  b.destroy();
  m.assets = undefined;
  library.destroy();
}, 30000);

import { wallMountCurve, wallMountPoint } from "../src/tiny-glade/runtime/WallMountGeometry";
import { profileShape } from "../src/tiny-glade/runtime/ProfileGeometry";
it("publishes translated Point-node mounts using the same solved installation as rendering", async () => {
  const { s, m } = setup(),
    library = constructionAssets();
  Object.defineProperty(library, "engine", { value: engine });
  m.assets = library;
  m.terrain = () => 10;
  const draft = house(),
    wall = draft.parts.find((p) => p.type === "wall")!,
    window = draft.parts.find((p) => p.type === "window")!;
  const point = wallMountPoint(wallMountCurve(profileShape(wall.support.params)), 0.35, 8);
  delete window.support.params.spec.u;
  delete window.support.params.spec.bottom;
  window.support.params.point = [0, 0, 0];
  const frame = m.create(s.createRootEntity(), draft),
    part = m.get(window.id, frame)!;
  part.entity.transform.setPosition(point[0], point[1], point[2]);
  await m.flushAsync();
  expect(m.partView(part)!.position.y).toBeCloseTo(18.75);
  part.entity.transform.setPosition(point[0], point[1] + 1, point[2]);
  await m.flushAsync();
  const design = designBuilding(m.snapshot(frame), () => 10, nativeAssets.compilation);
  expect(m.partView(part)!.position.y).toBeCloseTo(design.prepared.decorations[0].mounts[0].mount.origin[1]);
  expect(m.partView(part)!.position.y).toBeCloseTo(19.75);
  frame.destroy();
  m.assets = undefined;
  library.destroy();
});
