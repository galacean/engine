import { expect, it } from "vitest";
import { RuntimeProjectEdit } from "@galacean/engine-project/runtime-editor/project/runtime-project-edit";
import { RUNTIME_PROJECT_SAVE_VERSION } from "@galacean/engine-project/runtime-editor/project/runtime-project";
import { RuntimeSceneEdit } from "@galacean/engine-runtime-editor/runtime-editor/scene/runtime-scene-edit";
import { cleanRemovedWaterConnections } from "../src/spatial/runtime/WaterSourceConnections";

const connection = (id = "join", target: unknown = { $component: "right-body" }) => ({
  id,
  target,
  section: [
    [0, 0],
    [0, 1]
  ],
  transitionLengths: [1, 1]
});
const source = () => ({
  asset: { version: "2.0" },
  scene: { rootEntities: ["group"] },
  entities: [
    { id: "group", name: "Group", children: ["left", "right"] },
    { id: "left", name: "Left", components: ["left-body"] },
    { id: "right", name: "Right", components: ["right-body"] }
  ],
  components: [
    {
      id: "left-body",
      type: "WaterBodyComponent",
      props: { enabled: false, authoring: { connections: [connection()] } }
    },
    { id: "right-body", type: "WaterBodyComponent", props: { authoring: { connections: [] } } }
  ]
});
function pair(prefab = false) {
  const files = {
    "Main.scene": JSON.stringify(
      prefab ? { asset: { version: "2.0" }, scene: { rootEntities: [] }, entities: [], components: [] } : source()
    ),
    ...(prefab ? { "Water.prefab": JSON.stringify({ ...source(), scene: undefined, root: "group" }) } : {})
  };
  const pack = {
    version: RUNTIME_PROJECT_SAVE_VERSION,
    project: {
      scene: "Main.scene",
      files: Object.keys(files).map((virtualPath) => ({
        virtualPath,
        path: virtualPath,
        type: virtualPath.endsWith("prefab") ? "Prefab" : "Scene"
      }))
    },
    contents: files
  };
  const formats = new Map(
    ["Scene", "Prefab"].map((type) => [
      type,
      { validate: (value: unknown) => JSON.parse(value as string), references: () => [] }
    ])
  );
  const draft = new RuntimeProjectEdit(pack, formats),
    current = new RuntimeSceneEdit(draft, "Main.scene");
  if (prefab) {
    current.create({ name: "A", prefab: "Water.prefab" });
    current.create({ name: "B", prefab: "Water.prefab" });
  }
  const before = new RuntimeSceneEdit(new RuntimeProjectEdit(draft.preview(), formats), "Main.scene");
  return { before, current };
}
const connections = (scene: RuntimeSceneEdit, id: string) =>
  (scene.readComponent(id).props!.authoring as any).connections;
it.each(["component", "entity"])(
  "cleans existing incoming connections after public %s removal, including disabled owners",
  (kind) => {
    const { before, current } = pair();
    if (kind === "component") current.removeComponent("right-body");
    else current.delete("right");
    expect(cleanRemovedWaterConnections(before, current)).toBe(true);
    expect(connections(current, "left-body")).toEqual([]);
    expect(connections(before, "left-body")).toHaveLength(1);
    expect(cleanRemovedWaterConnections(before, current)).toBe(false);
  }
);
it("keeps invalid user input and newly introduced dangling connections for validation to reject", () => {
  const { before, current } = pair();
  current.removeComponent("right-body");
  current.updateComponent("left-body", {
    authoring: { connections: [connection("typo", { $component: "missing" }), connection("new")] } as any
  });
  expect(cleanRemovedWaterConnections(before, current)).toBe(false);
  expect(connections(current, "left-body")).toHaveLength(2);
});
it("removes only the deleted Prefab instance member's connections", () => {
  const { before, current } = pair(true);
  const members = current.queryComponents({ type: "WaterBodyComponent" });
  const right = members.find((item) => current.readEntity(item.entityId).name === "Right")!;
  const left = members.find(
    (item) =>
      current.readEntity(item.entityId).name === "Left" &&
      current.resolveComponentReference(connections(current, item.id)[0].target, item.id) === right.id
  )!;
  current.removeComponent(right.id);
  expect(cleanRemovedWaterConnections(before, current)).toBe(true);
  expect(connections(current, left.id)).toEqual([]);
  const other = members.find((item) => current.readEntity(item.entityId).name === "Left" && item.id !== left.id)!;
  expect(connections(current, other.id)).toHaveLength(1);
});
it("preserves unresolved references when no source water was deleted", () => {
  const { before, current } = pair();
  current.updateComponent("left-body", {
    authoring: { connections: [connection("typo", { $component: "missing" })] } as any
  });
  expect(cleanRemovedWaterConnections(before, current)).toBe(false);
  expect(connections(current, "left-body")[0].target.$component).toBe("missing");
});
