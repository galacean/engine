import "../src/building/parts/supports/PointSupport";
import "../src/building/parts/algorithms/PlaceAtPoint";
import { BuildingGroupComponent } from "../src/building/parts/architecture/BuildingGroupComponent";
import { buildingPartKey, buildingGroupKey } from "../src/building/runtime/BuildingObjectIdentity";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("@galacean/engine", async () => ({
  ...(await import("@galacean/engine-core")),
  ...(await import("@galacean/engine-loader")),
  ...(await import("@galacean/engine-math"))
}));
import { Matrix, Entity, Scene, ModelMesh, MeshRenderer, Vector2, Vector3, type Engine } from "@galacean/engine";
import { BuildingManager } from "../src/building/parts/architecture/BuildingManager";
import { BuildingPartComponent } from "../src/building/parts/architecture/BuildingPartComponent";
import { RuntimeSceneInspection } from "@galacean/engine-runtime-editor/runtime-inspection/runtime-scene-inspection.ts";

const scenes: Scene[] = [];
const engine = {
  canvas: { width: 800, height: 600 },
  resourceManager: { _deleteAsset() {}, _deleteContentRestorer() {}, _addReferResource() {}, _deleteReferResource() {} }
} as unknown as Engine;

/** No GPU is needed for membership. Use the native Scene root operations and
 * Entity/Component activation/destruction, with only rendering initialization
 * and script scheduling omitted. Full saved-scene loading is checked in browser. */
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
      removeOnLateUpdateScript() {}
    }
  }) as Scene;
  scenes.push(result);
  return result;
}
afterEach(() => {
  for (const s of scenes.splice(0)) for (const root of [...s.rootEntities]) root.destroy();
});

it("keeps authored root order when building parts enable before later scene roots", () => {
  const s = scene(false);
  const camera = s.createRootEntity("camera");
  const house = new Entity(engine, "house");
  const wall = house.createChild("wall").addComponent(BuildingPartComponent);
  s.addRootEntity(house);
  const farm = s.createRootEntity("farm");
  expect(s.rootEntities).toEqual([camera, house, farm]);
  expect(BuildingManager.existing(s)).toBeUndefined();

  const manager = BuildingManager.forScene(s);
  expect(s.rootEntities.slice(0, 3)).toEqual([camera, house, farm]);
  expect(manager.list()).toEqual([wall]);
  expect(BuildingManager.forScene(s)).toBe(manager);
  expect(s.rootEntities).toHaveLength(4);
});

it("collects loaded active parts and follows component and ancestor enablement", () => {
  const s = scene();
  const root = s.createRootEntity();
  const active = root.createChild().addComponent(BuildingPartComponent);
  const disabled = root.createChild().addComponent(BuildingPartComponent);
  disabled.enabled = false;
  const inactiveRoot = s.createRootEntity();
  inactiveRoot.isActive = false;
  const inactive = inactiveRoot.createChild().addComponent(BuildingPartComponent);
  const manager = BuildingManager.forScene(s);
  expect(manager.list()).toEqual([active]);

  disabled.enabled = true;
  inactiveRoot.isActive = true;
  expect(
    manager
      .list()
      .map((p) => p.instanceId)
      .sort()
  ).toEqual([active, disabled, inactive].map((p) => p.instanceId).sort());
  root.isActive = false;
  expect(manager.list()).toEqual([inactive]);
  root.isActive = true;
  active.enabled = false;
  expect(
    manager
      .list()
      .map((p) => p.instanceId)
      .sort()
  ).toEqual([disabled, inactive].map((p) => p.instanceId).sort());
});

it("moves membership between scenes and unregisters deleted parts", () => {
  const first = scene(),
    second = scene();
  const a = BuildingManager.forScene(first),
    b = BuildingManager.forScene(second);
  const root = first.createRootEntity();
  const part = root.createChild().addComponent(BuildingPartComponent);
  expect(a.list()).toEqual([part]);
  second.addRootEntity(root);
  expect(a.list()).toEqual([]);
  expect(b.list()).toEqual([part]);
  part.destroy();
  expect(b.list()).toEqual([]);
});

it("releases the scene manager identity and rediscovers parts when recreated", () => {
  const s = scene();
  const part = s.createRootEntity().addComponent(BuildingPartComponent);
  const previous = BuildingManager.forScene(s);
  previous.entity.destroy();
  expect(BuildingManager.existing(s)).toBeUndefined();
  expect(previous.list()).toEqual([]);
  const next = BuildingManager.forScene(s);
  expect(next).not.toBe(previous);
  expect(next.list()).toEqual([part]);
});

it("exposes live build status through the Agent's property-only runtime inspection", () => {
  const s = scene();
  const manager = BuildingManager.forScene(s);
  const inspection = new RuntimeSceneInspection(s);
  const info = inspection.queryComponents(inspection.id(manager.entity));
  const record = info.components.find((c) => c.id === manager.instanceId)!;
  expect(record.properties).toContain("buildStatus");
  expect(record.properties).not.toContain("errors");
  expect(manager.buildStatus).toEqual({
    bound: false,
    pending: true,
    generation: 0,
    errors: [],
    diagnostics: []
  });
  const observed = inspection.readComponent(record.id, ["buildStatus"]);
  expect(observed.values.buildStatus).toEqual({
    type: "Object",
    bound: false,
    pending: true,
    generation: 0,
    errors: { length: 0, items: [], truncated: false },
    diagnostics: { length: 0, items: [], truncated: false }
  });
  const generation = manager.generation;
  inspection.readComponent(record.id, ["buildStatus"]);
  expect(manager.generation).toBe(generation);
  manager.entity.destroy();
  expect(inspection.readComponent(record.id, ["buildStatus"]).status).toBe("unavailable");
});

import { PrefabResource } from "@galacean/engine";
import { European } from "../src/building/parts/architecture/European";
import { validatePartCollection } from "../src/building/parts/architecture/BuildingPartCollection";
import { buildingInstanceKey } from "../src/building/parts/architecture/BuildingRuntime";

it("scopes cloned prefab definitions, query handles and edits to their native frame", () => {
  const s = scene();
  const manager = BuildingManager.forScene(s);
  manager.bind({ camera: { engine, destroyed: false } as any });
  const source = manager.create(s.createRootEntity(), European.buildHouses({ id: "house" }));
  const prefab = new PrefabResource(engine, "instance-identity.prefab");
  // Keep the native template out of scene registration, just like the loader.
  source.parent!.removeChild(source);
  prefab._root = source;
  const a = prefab.instantiate(),
    b = prefab.instantiate();
  s.addRootEntity(a);
  s.addRootEntity(b);
  try {
    expect(() => validatePartCollection([...manager.listGroups(), ...manager.list()])).not.toThrow();
    expect(manager.snapshot(a)).toEqual(manager.snapshot(b));
    const wallA = manager.get("house-wall", a)!,
      wallB = manager.get("house-wall", b)!;
    expect(wallA).not.toBe(wallB);
    expect(wallA.frame).toBe(a);
    expect(wallB.frame).toBe(b);
    expect(manager.resolve(buildingInstanceKey(a, buildingGroupKey("house")))).toBe(manager.groupFor(wallA));
    expect(manager.resolve(buildingInstanceKey(b, buildingGroupKey("house")))).toBe(manager.groupFor(wallB));
    const changed = wallA.definition!;
    changed.support.params.height = 9;
    manager.update(wallA, changed);
    expect(wallB.definition!.support.params.height).not.toBe(9);
    manager.remove(a);
    expect(manager.resolve(buildingInstanceKey(a, buildingGroupKey("house")))).toBeUndefined();
    expect(manager.resolve(buildingInstanceKey(b, buildingGroupKey("house")))).toBe(manager.groupFor(wallB));
  } finally {
    prefab.destroy();
  }
});

it("allows repeated draft creation while rejecting duplicate IDs inside one frame", () => {
  const s = scene(),
    manager = BuildingManager.forScene(s),
    parent = s.createRootEntity();
  const draft = European.buildHouses({ id: "house" });
  const a = manager.create(parent, draft),
    b = manager.create(parent, draft);
  expect(() => validatePartCollection([...manager.listGroups(), ...manager.list()])).not.toThrow();
  const extra = a.createChild().addComponent(BuildingPartComponent);
  extra.frame = a;
  extra.definition = manager.get("house-wall", a)!.definition;
  expect(() => validatePartCollection([...manager.listGroups(), ...manager.list()])).toThrow(/duplicate/);
  extra.destroy();
  expect(manager.snapshot(a)).toEqual(manager.snapshot(b));
});

it("keeps local window names independent across houses and prefab instances", () => {
  const s = scene(),
    manager = BuildingManager.forScene(s);
  manager.bind({ camera: { engine, destroyed: false } as any });
  const window = {
    id: "window",
    kind: "window" as const,
    type: "window-cottage",
    host: "wall" as const,
    u: 0.35,
    bottom: 1.2,
    width: 1.2,
    height: 1.5
  };
  const draft = European.buildHouses([
    { id: "a", attachments: [window] },
    { id: "b", attachments: [window] }
  ]);
  const frame = manager.create(s.createRootEntity(), draft);
  expect(() => validatePartCollection([...manager.listGroups(), ...manager.list()])).not.toThrow();
  expect(manager.resolve(buildingInstanceKey(frame, buildingPartKey("a/window")))).toBe(manager.get("a/window", frame));
  expect(manager.resolve(buildingInstanceKey(frame, buildingPartKey("b/window")))).toBe(manager.get("b/window", frame));
  expect(manager.resolve(buildingInstanceKey(frame, buildingPartKey("window")))).toBeUndefined();
});

import { collectBuildingParts } from "../src/building/parts/architecture/BuildingPartCollection";
import { prepareBuilding } from "../src/building/parts/architecture/BuildingPipeline";
import "../src/building/parts/supports/MeshSupport";
import "../src/building/parts/algorithms/SurfaceGrid";
it("explicit mesh succeeds through actual collection and candidate pipeline", async () => {
  const e: any = {
    ...engine,
    resourceManager: { ...engine.resourceManager, _addGraphicResource() {}, _deleteGraphicResource() {} },
    _hardwareRenderer: {
      createPlatformPrimitive: () => ({ destroy() {} }),
      capability: { canUseFloatTextureBlendShape: false }
    }
  };
  const frame = new Entity(e),
    owner = frame.createChild("surface owner"),
    mesh = new ModelMesh(e);
  mesh.setPositions([new Vector3(0, 0, 0), new Vector3(1, 0, 0), new Vector3(0, 0, 1)]);
  mesh.setUVs([new Vector2(0, 0), new Vector2(1, 0), new Vector2(0, 1)]);
  mesh.setIndices(new Uint16Array([0, 2, 1]));
  mesh.addSubMesh(0, 3);
  owner.addComponent(MeshRenderer).mesh = mesh;
  const part = owner.addComponent(BuildingPartComponent);
  part.frame = frame;
  const group = owner.addComponent(BuildingGroupComponent);
  group.frame = frame;
  group.definition = { id: "g", seed: 17, wallColor: 0, woodColor: 0 };
  part.definition = {
    id: "p",
    group: "g",
    type: "roof",
    support: { generator: "meshSurface", params: { mesh } },
    algorithm: { type: "staggeredGrid" },
    params: { step: [0.5, 0.5] },
    unit: { name: "empty template" }
  };
  const output = frame.createChild("Building output");
  let candidate: any;
  try {
    const input = collectBuildingParts(frame, [group], [group, part], undefined);
    expect(input.execution).toBe("main");
    candidate = await prepareBuilding(input.draft, {
      parent: output,
      camera: {} as any,
      terrain: () => 0,
      signal: new AbortController().signal
    });
    expect(candidate.result.instanceParts).toHaveLength(1);
    expect(candidate.metrics.flatUnits).toBeGreaterThan(0);
  } finally {
    candidate?.destroy();
    frame.destroy();
    mesh.destroy();
  }
});

import { designBuilding } from "../src/building/parts/architecture/BuildingDesign";
import { implementBuilding } from "../src/building/parts/architecture/BuildingImplementation";
import { buildingDraftSource } from "../src/building/parts/architecture/BuildingSource";
import { nativeAssets } from "./fixtures/constructionAssets";
import { buildBuildingRenderPackage } from "../src/building/runtime/BuildingRenderPackage";
import { buildingGlobals } from "../src/building/runtime/BuildingGlobals";
import { createHash } from "node:crypto";

it("preserves every part binding and rendered bytes across all house part permutations", async () => {
  const s = scene(),
    manager = BuildingManager.forScene(s),
    parent = s.createRootEntity();
  manager.bind({ camera: { engine, destroyed: false } as any });
  const library = new PrefabResource(engine, "reorder-assets.prefab");
  const source = European.buildHouses({
    id: "house",
    plaster: { enabled: true, wear: 0.2, color: 0 },
    attachments: [
      {
        id: "window",
        kind: "window",
        type: "window-cottage",
        host: "wall",
        u: 0.35,
        bottom: 1.2,
        width: 1.2,
        height: 1.5,
        rank: 1
      }
    ]
  });
  let expected: string[] | undefined;
  try {
    for (const order of [
      [0, 1, 2],
      [0, 2, 1],
      [1, 0, 2],
      [1, 2, 0],
      [2, 0, 1],
      [2, 1, 0]
    ]) {
      const draft = structuredClone(source);
      draft.parts = order.map((i) => draft.parts[i]);
      const saved = buildingDraftSource(draft, { id: "frame" });
      expect((saved.components.find((c) => c.type === "BuildingGroupComponent")?.props!.definition as any).id).toBe(
        "house"
      );
      const frame = manager.create(parent, draft);
      try {
        const parts = manager.list().filter((p) => p.frame === frame);
        const input = collectBuildingParts(
          frame,
          manager.listGroups().filter((g) => g.frame === frame),
          parts,
          undefined,
          library
        );
        for (const part of parts) expect(input.bindings.get(buildingPartKey(part.definition!.id))?.member).toBe(part);
        const wall = manager.get("house-wall", frame)!;
        expect(input.bindings.get(buildingGroupKey("house"))?.member).toBe(manager.groupFor(wall));
        expect(manager.resolve(buildingInstanceKey(frame, buildingGroupKey("house")))).toBe(manager.groupFor(wall));
        const layout = await implementBuilding(designBuilding(input.draft, () => 0, nativeAssets.compilation));
        const poses = new Map([...input.bindings].map(([id, binding]) => [id, binding.inverse]));
        // Actual render packing validates every part/group binding, not just map membership.
        const rendered = buildBuildingRenderPackage(
          layout.renderInput,
          nativeAssets,
          buildingGlobals(layout.renderInput.paletteSlots, nativeAssets.frame),
          true,
          poses,
          nativeAssets.compilation.stoneGeometry
        );
        // Placement IDs describe layout jobs, never authored object identities.
        for (const draw of rendered.package.draws) {
          if (draw.pickId !== undefined) expect(parts.some((p) => p.definition!.id === draw.pickId)).toBe(true);
          for (const key of draw.pickIds ?? []) expect(input.bindings.has(key)).toBe(true);
          if (draw.objectBinding) expect(input.bindings.has(draw.objectBinding.id)).toBe(true);
        }
        const hashes = await Promise.all(
          rendered.dynamicFiles.map(async (p) =>
            createHash("sha256")
              .update(new Uint8Array(await rendered.asset(p)))
              .digest("hex")
          )
        );
        hashes.sort();
        if (expected) expect(hashes).toEqual(expected);
        else expected = hashes;
      } finally {
        manager.remove(frame);
      }
    }
  } finally {
    library.destroy();
  }
});

it("allows a group and an attachment to share an author ID without sharing runtime identity", () => {
  const s = scene(),
    manager = BuildingManager.forScene(s);
  manager.bind({ camera: { engine, destroyed: false } as any });
  const draft = European.buildHouses({
    id: "house",
    attachments: [
      {
        id: "window",
        kind: "window",
        type: "window-cottage",
        host: "wall",
        u: 0.35,
        bottom: 1.2,
        width: 1.2,
        height: 1.5
      }
    ]
  });
  const window = draft.parts.find((p) => p.type === "window")!;
  draft.relations.find((r) => r.from.part === window.id)!.from.part = "house";
  window.id = "house";
  draft.parts.unshift(draft.parts.pop()!);
  const frame = manager.create(s.createRootEntity(), draft);
  expect(() => validatePartCollection([...manager.listGroups(), ...manager.list()])).not.toThrow();
  expect(manager.resolve(buildingInstanceKey(frame, buildingPartKey("house")))).toBe(manager.get("house", frame));
  expect(manager.resolve(buildingInstanceKey(frame, buildingGroupKey("house")))).toBe(
    manager.groupFor(manager.get("house-wall", frame)!)
  );
});

it("does not move the structural group binding when its window moves", () => {
  const s = scene(),
    manager = BuildingManager.forScene(s);
  const draft = European.buildHouses({
    id: "house",
    attachments: [
      {
        id: "window",
        kind: "window",
        type: "window-cottage",
        host: "wall",
        u: 0.35,
        bottom: 1.2,
        width: 1.2,
        height: 1.5
      }
    ]
  });
  const definition = draft.parts.find((p) => p.type === "window")!;
  definition.support.params.point = [0, 1.2, 3];
  delete definition.support.params.spec.u;
  delete definition.support.params.spec.bottom;
  draft.parts.unshift(draft.parts.pop()!);
  const frame = manager.create(s.createRootEntity(), draft);
  const window = manager.get("house/window", frame)!,
    wall = manager.get("house-wall", frame)!;
  expect(manager.groupFor(window).definition?.id).toBe("house");
  const library = new PrefabResource(engine, "moving-window-assets.prefab");
  try {
    const collect = () => collectBuildingParts(frame, [manager.groupFor(window)], manager.list(), undefined, library);
    const before = collect();
    window.entity.transform.setPosition(0.5, 0, 0);
    const after = collect();
    expect(after.bindings.get(buildingGroupKey("house"))?.member).toBe(manager.groupFor(wall));
    expect(after.bindings.get(buildingGroupKey("house"))?.inverse).toEqual(
      before.bindings.get(buildingGroupKey("house"))?.inverse
    );
    expect(after.bindings.get(buildingPartKey("house/window"))?.inverse).not.toEqual(
      before.bindings.get(buildingPartKey("house/window"))?.inverse
    );
    expect(after.draft.parts.find((p) => p.id === "house/window")!.support.params.point).toEqual([0.5, 1.2, 3]);
    expect(after.draft.parts.find((p) => p.id === "house-wall")).toEqual(
      before.draft.parts.find((p) => p.id === "house-wall")
    );
  } finally {
    library.destroy();
  }
});

it.each([false, true])(
  "removing or disabling the first window preserves the independent group (disable=%s)",
  (disable) => {
    const s = scene(),
      manager = BuildingManager.forScene(s);
    const draft = European.buildHouses({
      id: "house",
      attachments: [
        {
          id: "window",
          kind: "window",
          type: "window-cottage",
          host: "wall",
          u: 0.35,
          bottom: 1.2,
          width: 1.2,
          height: 1.5
        }
      ]
    });
    draft.parts.unshift(draft.parts.pop()!);
    const frame = manager.create(s.createRootEntity(), draft),
      window = manager.get("house/window", frame)!,
      group = manager.groupFor(window);
    if (disable) window.enabled = false;
    else manager.remove(window.entity);
    expect(group.destroyed).toBe(false);
    expect(manager.snapshot(frame).groups).toEqual(draft.groups);
    expect(
      manager
        .list()
        .map((p) => p.definition!.id)
        .sort()
    ).toEqual(["house-roof", "house-wall"]);
    expect(() => validatePartCollection([...manager.listGroups(), ...manager.list()])).not.toThrow();
  }
);

it("keeps an empty group independently editable and removable", () => {
  const s = scene(),
    manager = BuildingManager.forScene(s);
  const frame = manager.create(s.createRootEntity(), {
    groups: [{ id: "empty", seed: 17, wallColor: 0, woodColor: 0 }],
    parts: [],
    relations: []
  });
  expect(manager.list()).toHaveLength(0);
  expect(manager.listGroups()).toHaveLength(1);
  expect(manager.snapshot(frame).groups[0].id).toBe("empty");
  manager.remove(frame);
  expect(manager.listGroups()).toHaveLength(0);
});

it("the group owns its library through part deletion, native cloning and destruction", () => {
  const s = scene(),
    manager = BuildingManager.forScene(s),
    library = new PrefabResource(engine, "group-owned-library.prefab");
  manager.assets = library;
  const frame = manager.create(
    s.createRootEntity(),
    European.buildHouses({
      id: "house",
      attachments: [
        {
          id: "window",
          kind: "window",
          type: "window-cottage",
          host: "wall",
          u: 0.35,
          bottom: 1.2,
          width: 1.2,
          height: 1.5
        }
      ]
    })
  );
  manager.assets = undefined;
  expect(library.refCount).toBe(1);
  manager.remove(manager.get("house/window", frame)!.entity);
  expect(library.refCount).toBe(1);
  const copy = frame.clone();
  s.addRootEntity(copy);
  expect(manager.groupFor(manager.get("house-wall", copy)!).frame).toBe(copy);
  expect(library.refCount).toBe(2);
  manager.remove(frame);
  expect(library.refCount).toBe(1);
  manager.remove(copy);
  expect(library.refCount).toBe(0);
  library.destroy();
});

it.each(["hidden-frame", "hidden-group", "disabled-components"])(
  "deletes owned author data independently of runtime membership: %s",
  (state) => {
    const s = scene(),
      manager = BuildingManager.forScene(s),
      parent = s.createRootEntity();
    const draft = European.buildHouses({ id: "house" });
    const a = manager.create(parent, draft),
      b = manager.create(parent, draft);
    const wall = manager.get("house-wall", a)!,
      group = manager.groupFor(wall);
    const before = manager.snapshot(b);
    if (state === "hidden-frame") a.isActive = false;
    else if (state === "hidden-group") group.entity.isActive = false;
    else
      for (const member of [
        ...a.getComponentsIncludeChildren(BuildingGroupComponent, []),
        ...a.getComponentsIncludeChildren(BuildingPartComponent, [])
      ])
        member.enabled = false;
    expect(manager.get("house-wall", a)).toBe(wall);
    expect(manager.groupFor(wall)).toBe(group);
    expect(manager.snapshot(a)).toEqual(draft);
    manager.remove(a);
    expect(a.destroyed).toBe(true);
    expect(wall.destroyed).toBe(true);
    expect(group.destroyed).toBe(true);
    expect(b.destroyed).toBe(false);
    expect(manager.snapshot(b)).toEqual(before);
  }
);

it("does not delete an unrelated Entity or another Scene through ownership lookup", () => {
  const s = scene(),
    manager = BuildingManager.forScene(s);
  const unrelated = s.createRootEntity();
  const other = scene(),
    otherManager = BuildingManager.forScene(other);
  const frame = otherManager.create(other.createRootEntity(), European.buildHouses({ id: "house" }));
  frame.isActive = false;
  expect(() => manager.remove(unrelated)).toThrow(/does not own/);
  expect(() => manager.remove(frame)).toThrow(/does not own/);
  expect(unrelated.destroyed || frame.destroyed).toBe(false);
});

it("publishes other frames while a Group is disabled, and restores its execution on enable", async () => {
  const s = scene(),
    manager = BuildingManager.forScene(s);
  manager.bind({
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
  const unit = new Entity(engine, "plain-unit");
  const draft = {
    groups: [{ id: "house", seed: 17, wallColor: 0, woodColor: 0 }],
    parts: [
      {
        id: "part",
        group: "house",
        type: "fixture",
        support: { generator: "point", params: {} },
        algorithm: { type: "placeAtPoint" },
        unit,
        params: {}
      }
    ],
    relations: []
  };
  const parent = s.createRootEntity(),
    a = manager.create(parent, draft),
    b = manager.create(parent, draft);
  try {
    await manager.flushAsync();
    const pa = manager.get("part", a)!,
      pb = manager.get("part", b)!;
    const group = manager.groupFor(pa),
      before = manager.snapshot(a);
    const generation = manager.generation;
    group.enabled = false;
    const changed = pb.definition!;
    changed.params.label = "changed while A disabled";
    manager.update(pb, changed);
    await manager.flushAsync();
    expect(manager.errors()).toEqual([]);
    expect(manager.generation).toBeGreaterThan(generation);
    expect(manager.snapshot(a)).toEqual(before);
    expect(manager.resolve(buildingInstanceKey(a, buildingPartKey("part")))).toBeUndefined();
    expect(manager.resolve(buildingInstanceKey(b, buildingPartKey("part")))).toBe(pb);
    group.enabled = true;
    await manager.flushAsync();
    expect(manager.resolve(buildingInstanceKey(a, buildingPartKey("part")))).toBe(pa);
    expect(manager.snapshot(a)).toEqual(before);
    expect(manager.snapshot(b).parts[0].params.label).toBe(changed.params.label);
  } finally {
    manager.remove(a);
    manager.remove(b);
    unit.destroy();
  }
});

it("filters a disabled group from a shared frame without changing its authored connections or render data", async () => {
  const s = scene(),
    manager = BuildingManager.forScene(s),
    library = new PrefabResource(engine, "activation-assets.prefab");
  const frame = manager.create(
    s.createRootEntity(),
    European.buildHouses([{ id: "a" }, { id: "b", rectangle: { center: [15, 0], size: [8, 6], rotation: 0 } }])
  );
  const group = manager.groupFor(manager.get("a-wall", frame)!);
  const collect = () => collectBuildingParts(frame, manager.listGroups(), manager.list(), undefined, library);
  try {
    const before = collect(),
      authored = manager.snapshot(frame);
    const render = async (draft: typeof before.draft) => {
      const output = await implementBuilding(designBuilding(draft, () => 0, nativeAssets.compilation));
      const packageData = buildBuildingRenderPackage(
        output.renderInput,
        nativeAssets,
        buildingGlobals(output.renderInput.paletteSlots, nativeAssets.frame),
        true
      );
      return Promise.all(
        packageData.dynamicFiles.map(async (path) =>
          createHash("sha256")
            .update(new Uint8Array(await packageData.asset(path)))
            .digest("hex")
        )
      );
    };
    const bytes = await render(before.draft);
    group.enabled = false;
    const during = collect();
    expect(during.draft.groups.map((g) => g.id)).toEqual(["b"]);
    expect(during.draft.parts.every((p) => p.group === "b")).toBe(true);
    expect(manager.snapshot(frame)).toEqual(authored);
    expect(() =>
      validatePartCollection(
        frame
          .getComponentsIncludeChildren(BuildingGroupComponent, [])
          .concat(frame.getComponentsIncludeChildren(BuildingPartComponent, []) as any)
      )
    ).not.toThrow();
    group.enabled = true;
    expect(collect().draft).toEqual(before.draft);
    expect(await render(collect().draft)).toEqual(bytes);
  } finally {
    manager.remove(frame);
    library.destroy();
  }
});

it("does not hide genuinely broken author ownership behind inactive state", async () => {
  const s = scene(),
    manager = BuildingManager.forScene(s);
  manager.bind({ camera: { engine, destroyed: false } as any });
  const frame = manager.create(s.createRootEntity(), European.buildHouses({ id: "house" }));
  const group = manager.groupFor(manager.get("house-wall", frame)!);
  group.enabled = false;
  group.destroy();
  await expect(manager.flushAsync()).rejects.toThrow(/Missing group/);
});
