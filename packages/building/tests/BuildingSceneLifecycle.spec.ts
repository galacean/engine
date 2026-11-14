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
import { European } from "../src/building/application/European";
import { validatePartCollection } from "../src/building/parts/architecture/BuildingPartCollection";
import { buildingInstanceKey } from "../src/building/parts/architecture/BuildingRuntime";
import { collectBuildingParts } from "../src/building/parts/architecture/BuildingPartCollection";
import { compileBuildingCpu, prepareBuildingCpu } from "../src/building/parts/architecture/BuildingCpu";
import { nativeAssets } from "./fixtures/constructionAssets";
import { createHash } from "node:crypto";

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
    const wallA = manager.get("house-wall-0", a)!,
      wallB = manager.get("house-wall-0", b)!;
    expect(wallA).not.toBe(wallB);
    expect(wallA.frame).toBe(a);
    expect(wallB.frame).toBe(b);
    expect(manager.resolve(buildingInstanceKey(a, buildingGroupKey("house")))).toBe(manager.groupFor(wallA));
    expect(manager.resolve(buildingInstanceKey(b, buildingGroupKey("house")))).toBe(manager.groupFor(wallB));
    const changed = wallA.definition!;
    manager.update(wallA, { ...changed, unit: { "@shared": "brick", seed: 9 } });
    expect((wallB.definition!.unit as { seed?: number }).seed).toBeUndefined();
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
  extra.definition = manager.get("house-wall-0", a)!.definition;
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
  // The window takes its house's id: part and group identities are separate.
  const parts = draft.parts.map((p) => (p.type === "window" ? { ...p, id: "house" } : p));
  const renamed = {
    ...draft,
    parts: [parts.find((p) => p.id === "house")!, ...parts.filter((p) => p.id !== "house")],
    connections: (draft.connections ?? []).map((c) =>
      c.kind === "attach" && c.guest === "house/window" ? { ...c, guest: "house" } : c
    )
  };
  const frame = manager.create(s.createRootEntity(), renamed);
  expect(() => validatePartCollection([...manager.listGroups(), ...manager.list()])).not.toThrow();
  expect(manager.resolve(buildingInstanceKey(frame, buildingPartKey("house")))).toBe(manager.get("house", frame));
  expect(manager.resolve(buildingInstanceKey(frame, buildingGroupKey("house")))).toBe(
    manager.groupFor(manager.get("house-wall-0", frame)!)
  );
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
    const frame = manager.create(s.createRootEntity(), {
        ...draft,
        parts: [draft.parts.find((p) => p.type === "window")!, ...draft.parts.filter((p) => p.type !== "window")]
      }),
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
    ).toEqual(
      draft.parts
        .filter((p) => p.type !== "window")
        .map((p) => p.id)
        .sort()
    );
    expect(() => validatePartCollection([...manager.listGroups(), ...manager.list()])).not.toThrow();
  }
);

it("keeps an empty group independently editable and removable", () => {
  const s = scene(),
    manager = BuildingManager.forScene(s);
  const frame = manager.create(s.createRootEntity(), {
    groups: [{ id: "empty", seed: 17, wallColor: 0, woodColor: 0 }],
    parts: [],
    connections: []
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
  expect(manager.groupFor(manager.get("house-wall-0", copy)!).frame).toBe(copy);
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
    const wall = manager.get("house-wall-0", a)!,
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
    expect(manager.get("house-wall-0", a)).toBe(wall);
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

it("filters a disabled group from a shared frame without changing its authored connections or render data", async () => {
  const s = scene(),
    manager = BuildingManager.forScene(s),
    library = new PrefabResource(engine, "activation-assets.prefab");
  const frame = manager.create(
    s.createRootEntity(),
    European.buildHouses([{ id: "a" }, { id: "b", rectangle: { center: [15, 0], size: [8, 6], rotation: 0 } }])
  );
  const group = manager.groupFor(manager.get("a-wall-0", frame)!);
  const collect = () => collectBuildingParts(frame, manager.listGroups(), manager.list(), undefined, library);
  try {
    const before = collect(),
      authored = manager.snapshot(frame);
    const render = async (draft: typeof before.draft) =>
      createHash("sha256")
        .update(
          JSON.stringify(
            (
              await compileBuildingCpu(
                (await prepareBuildingCpu(draft, before.terrain.grid, nativeAssets.compilation)).prepared
              )
            ).renderInput
          )
        )
        .digest("hex");
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
  const group = manager.groupFor(manager.get("house-wall-0", frame)!);
  group.enabled = false;
  group.destroy();
  await expect(manager.flushAsync()).rejects.toThrow(/Missing group/);
});

it("rejects an invalid deletion plan before destroying objects or editing connections", () => {
  const s = scene(),
    manager = BuildingManager.forScene(s);
  const frame = manager.create(
    s.createRootEntity(),
    European.buildHouses({
      id: "house",
      attachments: [{ id: "window", kind: "window", u: 0.35, bottom: 1.2, width: 1.2, height: 1.5 }]
    })
  );
  const window = manager.get("house/window", frame)!,
    roof = manager.list().find((p) => p.definition!.type === "roof")!;
  const before = roof.connections;
  // A connection to a part that does not exist makes the remaining draft invalid.
  roof.connections = [...before, { kind: "join", id: "dangling", parts: [roof.definition!.id, "missing"] }];
  expect(() => manager.remove(window.entity)).toThrow(/Missing connection endpoint/);
  expect(window.destroyed).toBe(false);
  roof.connections = before;
  manager.remove(window.entity);
  expect(window.destroyed).toBe(true);
});

/** Supply accepted group membership without compiling geometry; the real metrics
 * implementation still reads current author definitions and active parts. */
function readGroupMetrics(manager: BuildingManager, groups: BuildingGroupComponent[]) {
  const views: Map<Entity, any> = (manager as any).views;
  try {
    for (const group of groups) {
      const frame = group.frame ?? group.entity.parent ?? group.entity;
      let view = views.get(frame);
      if (!view) views.set(frame, (view = { bodies: [] }));
      view.bodies.push(group);
    }
    return manager.metrics();
  } finally {
    views.clear();
  }
}
function metricGroup(frame: Entity, id: string) {
  const group = frame.createChild(id).addComponent(BuildingGroupComponent);
  group.frame = frame;
  group.definition = { id, seed: 0, shared: { nested: { value: 1 } } };
  return group;
}
function metricPart(group: BuildingGroupComponent, type: string) {
  const part = group.entity.createChild(type).addComponent(BuildingPartComponent);
  part.frame = group.frame;
  part.definition = {
    id: String(part.instanceId),
    group: group.definition!.id,
    type,
    geometry: { generator: "test", params: { value: 1 } }
  };
  return part;
}
function metricManager() {
  const s = scene(),
    manager = BuildingManager.forScene(s);
  manager.bind({ camera: { engine, destroyed: false } as any });
  return { s, manager };
}

it("counts houses within their frame and preserves wall precedence and custom type ordering", () => {
  const { s, manager } = metricManager();
  const a = metricGroup(s.createRootEntity(), "same"),
    b = metricGroup(s.createRootEntity(), "same");
  metricPart(a, "wall");
  metricPart(a, "wall");
  metricPart(a, "arch");
  metricPart(b, "roof");
  const custom = metricGroup(a.frame!, "custom"),
    empty = metricGroup(a.frame!, "empty");
  metricPart(custom, "house");
  expect(readGroupMetrics(manager, [a, b, custom, empty])).toMatchObject({ houses: 2, buildings: 4, groups: 2 });
  metricPart(custom, "arch");
  expect(readGroupMetrics(manager, [a, b, custom, empty]).houses).toBe(1);
  expect(readGroupMetrics(manager, []).houses).toBe(0);
});

it("refreshes diagnostics after definition, membership and frame changes without exposing mutable definitions", () => {
  const { s, manager } = metricManager();
  const a = metricGroup(s.createRootEntity(), "a"),
    b = metricGroup(s.createRootEntity(), "b");
  const part = metricPart(a, "wall");
  const read = () => readGroupMetrics(manager, [a, b]).houses;
  const partCopy = part.definition!,
    groupCopy = a.definition!;
  (partCopy as any).type = "roof";
  (partCopy.geometry.params as any).value = 2;
  (groupCopy.shared!.nested as any).value = 2;
  expect(read()).toBe(1);
  expect(part.definition!.geometry.params!.value).toBe(1);
  expect((a.definition!.shared!.nested as any).value).toBe(1);
  part.definition = { ...part.definition!, type: "roof" };
  expect(read()).toBe(0);
  part.definition = { ...part.definition!, type: "wall" };
  expect(read()).toBe(1);
  part.enabled = false;
  expect(read()).toBe(0);
  part.enabled = true;
  expect(read()).toBe(1);
  a.entity.isActive = false;
  expect(read()).toBe(0);
  a.entity.isActive = true;
  expect(read()).toBe(1);
  part.definition = { ...part.definition!, group: "b" };
  expect(read()).toBe(0);
  b.entity.addChild(part.entity);
  part.frame = b.frame;
  expect(read()).toBe(1);
  b.definition = { ...b.definition!, id: "renamed" };
  expect(read()).toBe(0);
  part.definition = { ...part.definition!, group: "renamed" };
  expect(read()).toBe(1);
  part.definition = null;
  expect(read()).toBe(0);
  const replacement = metricPart(b, "wall");
  expect(read()).toBe(1);
  replacement.destroy();
  expect(read()).toBe(0);
});

it("collects group diagnostics without cloning author definitions", () => {
  const { s, manager } = metricManager(),
    frame = s.createRootEntity();
  const groups = Array.from({ length: 20 }, (_, i) => metricGroup(frame, String(i)));
  const parts = groups.flatMap((g) => Array.from({ length: 10 }, () => metricPart(g, "wall")));
  const reads = [...groups, ...parts].map((p) => vi.spyOn(p, "definition", "get"));
  try {
    expect(readGroupMetrics(manager, groups)).toMatchObject({ houses: 20, buildings: 20, authoredObjects: 220 });
    // Reading metadata must not copy arbitrary geometry or shared author data.
    expect(reads.reduce((sum, spy) => sum + spy.mock.calls.length, 0)).toBe(0);
  } finally {
    reads.forEach((spy) => spy.mockRestore());
  }
});
