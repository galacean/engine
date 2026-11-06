import { RuntimeProjectEdit } from "@galacean/engine-project/runtime-editor/project/runtime-project-edit.ts";
import { RuntimeSceneEdit } from "@galacean/engine-runtime-editor/runtime-editor/scene/runtime-scene-edit.ts";
import { RUNTIME_PROJECT_SAVE_VERSION } from "@galacean/engine-project/runtime-editor/project/runtime-project.ts";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("@galacean/engine", async () => ({
  ...(await import("@galacean/engine-core")),
  ...(await import("@galacean/engine-loader")),
  ...(await import("@galacean/engine-math"))
}));
import { Entity, Scene, type Engine } from "@galacean/engine";
import { BuildingManager } from "@galacean/engine-building/tiny-glade/parts/architecture/BuildingManager.ts";
import { BuildingPartComponent } from "@galacean/engine-building/tiny-glade/parts/architecture/BuildingPartComponent.ts";

const scenes: Scene[] = [];
const engine = {
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
  vi.unstubAllGlobals();
  for (const s of scenes.splice(0)) for (const root of [...s.rootEntities]) root.destroy();
});

import { European } from "@galacean/engine-building/tiny-glade/parts/architecture/European.ts";
import { mountNativeBuildingPanel } from "../src/masonry/NativeBuildingPanel";
it.each(
  ["window", "wall", "group"].flatMap((kind) =>
    [
      "active",
      "disabled-part",
      "hidden-part",
      "hidden-group",
      "hidden-instance",
      "disabled-group",
      "disabled-survivor",
      "hidden-survivor"
    ].map((state) => [kind, state])
  )
)("saved deletion %s with %s stays in its instance", async (kind, state) => {
  const s = scene(),
    manager = BuildingManager.forScene(s),
    draft = European.buildHouses({
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
  const a = manager.create(s.createRootEntity(), draft),
    b = manager.create(s.createRootEntity(), draft);
  const parts = [...manager.list(), ...manager.listGroups()],
    records = parts.map((p) => ({
      id: String(p.instanceId),
      entityId: String(p.entity.instanceId),
      scene: "Main.scene",
      type: p.constructor.name
    }));
  const aWindow = manager.get(kind === "window" ? "house/window" : "house-wall", a)!;
  const selected = kind === "group" ? manager.groupFor(aWindow) : aWindow;
  const window = manager.get("house/window", a)!,
    group = manager.groupFor(window);
  if (state === "disabled-part") window.enabled = false;
  if (state === "hidden-part") window.entity.isActive = false;
  if (state === "hidden-group") group.entity.isActive = false;
  if (state === "hidden-instance") a.isActive = false;
  if (state === "disabled-group") group.enabled = false;
  const wall = manager.get("house-wall", a)!;
  if (state === "disabled-survivor" || state === "hidden-survivor") {
    wall.relations = [
      ...wall.relations,
      {
        id: "wall-window",
        from: { part: "house-wall", boundary: "surface" },
        to: { part: "house/window", boundary: "mount" },
        rule: "opening"
      }
    ];
    if (state === "disabled-survivor") wall.enabled = false;
    else wall.entity.isActive = false;
  }
  const node = () => ({
    style: {},
    value: "",
    textContent: "",
    options: [] as any[],
    onclick: null as any,
    append(...items: any[]) {
      this.options.push(...items);
    },
    replaceChildren() {
      this.options = [];
    },
    remove() {},
    setAttribute() {}
  });
  const select = node(),
    output = node(),
    controls = new Map<string, any>();
  const panel = {
    ...node(),
    querySelector(q: string) {
      if (q === '[data-field="component"]') return select;
      if (q === "output") return output;
      if (!controls.has(q)) controls.set(q, node());
      return controls.get(q);
    },
    querySelectorAll() {
      return [];
    }
  };
  vi.stubGlobal("document", {
    createElement: (tag: string) => (tag === "details" ? panel : node()),
    body: { append() {} },
    addEventListener() {},
    removeEventListener() {}
  });

  const entities: any[] = [];
  const walk = (e: Entity) => {
    entities.push({
      id: String(e.instanceId),
      name: e.name,
      isActive: e.isActive,
      children: e.children.map((c) => String(c.instanceId)),
      components: parts.filter((p) => p.entity === e).map((p) => String(p.instanceId))
    });
    for (const c of e.children) walk(c);
  };
  walk(a);
  walk(b!);
  const source: any = {
    asset: { version: "2.0" },
    scene: { rootEntities: [String(a.instanceId), String(b!.instanceId)] },
    entities,
    components: parts.map((p) => ({
      id: String(p.instanceId),
      type: p.constructor.name,
      props: {
        definition: p.definition,
        frame: { $entity: String(p.frame!.instanceId) },
        enabled: p.enabled,
        ...(p instanceof BuildingPartComponent ? { relations: p.relations } : {})
      }
    }))
  };
  const format = { validate: (s: any) => JSON.parse(s), references: () => [] };
  const formats = new Map([
    ["Scene", format],
    ["Prefab", format]
  ]);
  const packageData: any = {
    version: RUNTIME_PROJECT_SAVE_VERSION,
    project: { scene: "Main.scene", files: [{ virtualPath: "Main.scene", path: "Main.scene", type: "Scene" }] },
    contents: { "Main.scene": JSON.stringify(source) }
  };
  const authoring = new RuntimeProjectEdit(packageData, formats),
    authorScene = new RuntimeSceneEdit(authoring, "Main.scene");
  const otherIds = parts.filter((p) => p.frame === b).map((p) => String(p.instanceId));
  const otherBefore = otherIds.map((id) => authorScene.readComponent(id));

  const commands: any[] = [];
  const projection = {
    queryComponents: (query?: any) => records.filter((r) => !query?.id || r.id === query.id),
    component: (id: string) => parts.find((p) => String(p.instanceId) === id),
    identityOf: (p: any) => records.find((r) => r.id === String(p.instanceId)),
    readEntity: () => ({ name: "part" }),
    readComponent: () => ({ props: {} })
  };
  const edit = {
    tools: ["component.remove", "component.update"].map((name) => ({
      name,
      execute: async (value: any) => {
        commands.push({ name, value });
        if (name === "component.remove") authorScene.removeComponent(value.id);
        else authorScene.updateComponent(value.id, value.props);
      }
    })),
    prepare: async () => {},
    commit: async () => {},
    activate: async () => {},
    discard() {}
  };
  const mounted = mountNativeBuildingPanel(
    { registerRuntimeActivation: () => () => {} } as any,
    { projection, beginEdit: () => edit } as any,
    () => {},
    () => {}
  );
  try {
    select.value = String(selected.instanceId);
    panel.querySelector('[data-action="delete"]').onclick();
    await vi.waitFor(() => expect(output.textContent).toContain("已提交"));

    const expected = kind === "window" ? [aWindow] : parts.filter((p) => p.frame === a);
    const reopened = new RuntimeSceneEdit(
      new RuntimeProjectEdit(JSON.parse(JSON.stringify(authoring.preview())), formats),
      "Main.scene"
    );
    expect(otherIds.map((id) => reopened.readComponent(id))).toEqual(otherBefore);
    if (["disabled-survivor", "hidden-survivor"].includes(state) && kind === "window") {
      const saved = reopened.readComponent(String(wall.instanceId));
      if (state === "disabled-survivor") expect(saved.props!.enabled).toBe(false);
      else expect(reopened.readEntity(String(wall.entity.instanceId)).isActive).toBe(false);
      expect(saved.props!.relations).toEqual(wall.relations.filter((r) => r.id !== "wall-window"));
    }
    const remaining = reopened.queryComponents().map((r) => r.id);
    expect(remaining.filter((id) => expected.some((p) => String(p.instanceId) === id))).toEqual([]);

    expect(
      commands
        .filter((c) => c.name === "component.remove")
        .map((c) => c.value.id)
        .sort()
    ).toEqual(expected.map((p) => String(p.instanceId)).sort());
    expect(commands.every((c) => !parts.some((p) => p.frame === b && String(p.instanceId) === c.value.id))).toBe(true);
  } finally {
    mounted.destroy();
    vi.unstubAllGlobals();
  }
});
