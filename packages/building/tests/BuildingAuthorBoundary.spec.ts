import "../src/tiny-glade/parts/supports/PointSupport";
import "../src/tiny-glade/parts/algorithms/PlaceAtPoint";
import { BuildingGroupComponent } from "../src/tiny-glade/parts/architecture/BuildingGroupComponent";
import { afterEach, expect, it, vi } from "vitest";
// Keep loader/core in one native module graph so PrefabResource and ReferResource share identity.
vi.mock("@galacean/engine-core", async () => {
  const { default: Module } = await import("node:module");
  return Module.createRequire(import.meta.url)("@galacean/engine-core");
});
vi.mock("@galacean/engine", async () => {
  const { default: Module } = await import("node:module");
  const require = Module.createRequire(import.meta.url);
  return {
    ...require("@galacean/engine-core"),
    ...require("@galacean/engine-loader"),
    ...require("@galacean/engine-math")
  };
});
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
function draft(unit: BuildingBasePart["unit"]): BuildingDraft {
  return {
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
}

import { PrefabResource } from "@galacean/engine";
import { buildingConnectionRules } from "../src/tiny-glade/parts/architecture/BuildingDesignRules";

import type { BuildingBasePart, BuildingDraft } from "../src/tiny-glade/parts/architecture/BuildingDraft";
import { buildingPlacementAlgorithms } from "../src/tiny-glade/parts/BuildingAlgorithms";
import { authoredBuildingMembers } from "../src/tiny-glade/parts/architecture/BuildingPartCollection";
import { markGeneratedBuildingOutput } from "../src/tiny-glade/parts/BuildingGeneratedOutput";
import { European } from "../src/tiny-glade/parts/architecture/European";

buildingConnectionRules.register("removal-link", () => {});
function connected(unit: Entity) {
  const d = draft(unit);
  d.parts.push({ ...d.parts[0], id: "target" });
  return {
    ...d,
    relations: [
      {
        id: "link",
        from: { part: "part", boundary: "point" },
        to: { part: "target", boundary: "point" },
        rule: "removal-link"
      }
    ]
  };
}
it.each(
  ["active", "disabled-sender", "hidden-sender"].flatMap((state) =>
    ["entity", "component"].map((targetKind) => [state, targetKind])
  )
)("deletes incoming relations with %s via %s without changing another instance", async (state, targetKind) => {
  const { s, m } = setup(),
    unit = new Entity(engine, "plain"),
    parent = s.createRootEntity("author");
  const a = m.create(parent, connected(unit)),
    b = m.create(parent, connected(unit));
  try {
    await m.flushAsync();
    const sender = m.get("part", a)!,
      target = m.get("target", a)!,
      other = m.snapshot(b);
    if (state === "disabled-sender") sender.enabled = false;
    if (state === "hidden-sender") sender.entity.isActive = false;
    await m.flushAsync();
    m.remove(targetKind === "entity" ? target.entity : target);
    expect(target.destroyed).toBe(true);
    expect(sender.relations).toEqual([]);
    await m.flushAsync();
    expect(m.errors()).toEqual([]);
    expect(m.snapshot(b)).toEqual(other);
    expect(m.get("target", b)!.destroyed).toBe(false);
    sender.enabled = true;
    sender.entity.isActive = true;
    await m.flushAsync();
    expect(m.errors()).toEqual([]);
  } finally {
    parent.destroy();
    unit.destroy();
  }
});
it.each(["entity", "group", "part"])("deletes structural members via %s, including hidden members", (kind) => {
  const s = scene(),
    m = BuildingManager.forScene(s),
    parent = s.createRootEntity();
  const a = m.create(parent, European.buildHouses({ id: "house" })),
    b = m.create(parent, European.buildHouses({ id: "house" }));
  const before = m.snapshot(b),
    roof = m.get("house-roof", a)!;
  roof.entity.isActive = false;
  const wall = m.get("house-wall", a)!;
  m.remove(kind === "entity" ? wall.entity : kind === "group" ? m.groupFor(wall) : wall);
  expect(m.snapshot(a)).toEqual({ groups: [], parts: [], relations: [] });
  expect(roof.destroyed).toBe(true);
  expect(m.snapshot(b)).toEqual(before);
});
it.each(["entity", "prefab"].flatMap((kind) => ["active", "disabled", "hidden"].map((state) => [kind, state])))(
  "rejects Group-only %s Unit (%s) before publication and recovers after correction",
  async (kind, state) => {
    const { s, m } = setup(),
      unit = new Entity(engine, "group-unit"),
      plain = new Entity(engine, "plain"),
      parent = s.createRootEntity("author");
    const nested = unit.createChild("nested"),
      group = nested.addComponent(BuildingGroupComponent);
    group.definition = { id: "nested", seed: 17, wallColor: 0, woodColor: 0 };
    if (state === "disabled") group.enabled = false;
    if (state === "hidden") nested.isActive = false;
    const prefab = kind === "prefab" ? new PrefabResource(engine, "test-unit.prefab") : undefined;
    if (prefab) prefab._root = unit;
    try {
      const a = m.create(parent, draft(plain)),
        b = m.create(parent, draft(plain));
      await m.flushAsync();
      const oldOutput = a.children.find((e) => e.name === "Building output")!,
        other = m.snapshot(b),
        generation = m.generation;
      const part = m.get("part", a)!,
        changed = part.definition!;
      changed.unit = prefab ?? unit;
      m.update(part, changed);
      await expect(m.flushAsync()).rejects.toThrow(/cannot contain building author components/);
      expect(m.generation).toBe(generation);
      expect(oldOutput.destroyed).toBe(false);
      expect(oldOutput.isActive).toBe(true);
      expect(a.children.filter((e) => e.name === "Building output")).toEqual([oldOutput]);
      expect(m.listGroups()).toHaveLength(2);
      expect(m.snapshot(b)).toEqual(other);
      changed.unit = plain;
      m.update(part, changed);
      await m.flushAsync();
      expect(m.errors()).toEqual([]);
      expect(m.generation).toBeGreaterThan(generation);
      expect(oldOutput.destroyed).toBe(true);
      expect(m.listGroups()).toHaveLength(2);
      expect(m.snapshot(b)).toEqual(other);
    } finally {
      parent.destroy();
      if (prefab) prefab.destroy();
      else unit.destroy();
      plain.destroy();
    }
  }
);
it("generated ancestry is excluded from registration, author CRUD and manager recreation", async () => {
  const { s, m } = setup(),
    parent = s.createRootEntity(),
    output = parent.createChild("derived");
  markGeneratedBuildingOutput(output);
  await m.flushAsync();
  const node = output.createChild("generated-group"),
    group = node.addComponent(BuildingGroupComponent);
  group.definition = { id: "nested", seed: 17, wallColor: 0, woodColor: 0 };
  const part = node.createChild().addComponent(BuildingPartComponent);
  part.definition = { ...draft({ name: "empty" }).parts[0], group: "nested" };
  part.frame = parent;
  group.frame = parent;
  expect(m.buildStatus.pending).toBe(false);
  expect(m.listGroups()).toEqual([]);
  expect(m.list()).toEqual([]);
  expect(authoredBuildingMembers(parent)).toEqual([]);
  expect(m.get("part", parent)).toBeUndefined();
  expect(m.snapshot(parent)).toEqual({ groups: [], parts: [], relations: [] });
  expect(() => m.create(output, draft({ name: "empty" }))).toThrow(/generated/);
  expect(() => m.update(part, part.definition!)).toThrow(/Unmanaged/);
  expect(() => m.remove(node)).toThrow(/does not own/);
  expect(() => m.groupEntity(group)).toThrow(/Unmanaged/);
  m.entity.destroy();
  const next = BuildingManager.forScene(s);
  expect(next.listGroups()).toEqual([]);
  expect(next.list()).toEqual([]);
});
it("rejects Part Units before first publication", async () => {
  const { s, m } = setup(),
    unit = new Entity(engine, "part-unit"),
    parent = s.createRootEntity();
  unit.addComponent(BuildingPartComponent);
  try {
    m.create(parent, draft(unit));
    await expect(m.flushAsync()).rejects.toThrow(/cannot contain building author components/);
    expect(m.generation).toBe(0);
  } finally {
    parent.destroy();
    unit.destroy();
  }
});

it.each(["entity", "prefab"])("rejects architectural %s Units before invoking a packed builder", async (kind) => {
  const { s, m } = setup(),
    unit = new Entity(engine, "packed-unit"),
    parent = s.createRootEntity();
  unit.addComponent(BuildingGroupComponent).enabled = false;
  const prefab = kind === "prefab" ? new PrefabResource(engine, "packed-unit.prefab") : undefined;
  if (prefab) prefab._root = unit;
  const build = vi.fn(async () => ({ count: 1, draws: 0 }));
  buildingPlacementAlgorithms.register("boundary-packed-" + kind, () => ({ kind: "batch", build }));
  try {
    const input = draft(prefab ?? unit);
    input.parts[0].algorithm = { type: "boundary-packed-" + kind };
    m.create(parent, input);
    await expect(m.flushAsync()).rejects.toThrow(/cannot contain building author components/);
    expect(build).not.toHaveBeenCalled();
    expect(m.generation).toBe(0);
    expect(m.listGroups()).toHaveLength(1);
  } finally {
    parent.destroy();
    if (prefab) prefab.destroy();
    else unit.destroy();
  }
});

it("rejects an invalid deletion plan before destroying objects or editing relations", () => {
  const s = scene(),
    m = BuildingManager.forScene(s),
    unit = new Entity(engine),
    parent = s.createRootEntity();
  const a = m.create(parent, connected(unit)),
    b = m.create(parent, connected(unit)),
    sender = m.get("part", a)!,
    target = m.get("target", a)!;
  try {
    sender.relations = [
      ...sender.relations,
      {
        id: "broken",
        from: { part: "part", boundary: "point" },
        to: { part: "missing", boundary: "point" },
        rule: "removal-link"
      }
    ];
    const before = sender.relations,
      other = m.snapshot(b);
    expect(() => m.remove(target.entity)).toThrow(/Missing relation endpoint: broken/);
    expect(target.destroyed).toBe(false);
    expect(sender.relations).toEqual(before);
    expect(m.snapshot(b)).toEqual(other);
  } finally {
    parent.destroy();
    unit.destroy();
  }
});

it("picks derived renderers as their author part through publication and native instance cloning", async () => {
  const { s, m } = setup();
  const unit = new Entity(engine, "packed-unit"),
    parent = s.createRootEntity("authors");
  buildingPlacementAlgorithms.register("test.derived-pick", () => ({
    kind: "batch",
    async build(_unit, { parent }) {
      parent.createChild("pickable").addComponent(MeshRenderer);
      return { count: 1, draws: 1 };
    }
  }));
  buildingConnectionRules.register("test.derived-pick-link", ({ parts, relation }) => {
    const { id, ...part } = parts.find((p) => p.id === relation.from.part)!;
    return [{ ...part, localId: id, selection: { kind: "part", id } }];
  });
  const input = draft(unit);
  input.parts[0].algorithm.type = "test.derived-pick";
  input.parts[0].appearance = { roofColor: 4 };
  input.relations = [
    {
      id: "link",
      rule: "test.derived-pick-link",
      from: { part: "part", boundary: "point" },
      to: { part: "part", boundary: "point" }
    }
  ];
  const a = m.create(parent, input);
  try {
    await m.flushAsync();
    const b = a.clone();
    parent.addChild(b);
    await m.flushAsync();
    const partA = m.get("part", a)!,
      partB = m.get("part", b)!;
    const selected: unknown[] = [];
    m.visitPickBatches((batch) => {
      selected.push(m.resolve(batch.resolve(0)!));
    });
    expect(selected.filter((p) => p === partA)).toHaveLength(2);
    expect(selected.filter((p) => p === partB)).toHaveLength(2);
    expect(m.snapshot(a)).toEqual(m.snapshot(b));
    const changed = partB.definition!;
    changed.appearance = { roofColor: 7 };
    m.update(partB, changed);
    await m.flushAsync();
    expect(partA.definition!.appearance).toEqual({ roofColor: 4 });
    expect(partB.definition!.appearance).toEqual({ roofColor: 7 });
    m.remove(a);
    await m.flushAsync();
    const remaining: unknown[] = [];
    m.visitPickBatches((batch) => remaining.push(m.resolve(batch.resolve(0)!)));
    expect(remaining).toEqual([partB, partB]);
    expect(m.errors()).toEqual([]);
  } finally {
    parent.destroy();
    unit.destroy();
  }
});
