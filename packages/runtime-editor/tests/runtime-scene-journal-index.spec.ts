import { expect, it } from "vitest";
import type { SceneFile } from "@galacean/engine";
import { RuntimeSceneChanges, RuntimeSceneRecords } from "../src/runtime-editor/scene/runtime-scene-changes";

it("updates reference edges and closes cycles without inspecting untouched records", () => {
  const source: GalaceanSourceSceneFile = {
    asset: { version: "2.0" },
    scene: { rootEntities: ["root", "unrelated"] },
    entities: [
      { id: "root", components: ["a", "b", "c"] },
      { id: "unrelated", components: ["untouched"] }
    ],
    components: [
      { id: "a", type: "Probe", props: { target: { $component: "b" } } },
      { id: "b", type: "Probe", props: { target: { $component: "a" } } },
      {
        id: "c",
        type: "Probe",
        props: { signal: { $signal: [{ target: { $component: "a" }, methodName: "receive" }] } }
      },
      { id: "untouched", type: "Probe", props: {} }
    ]
  };
  const runtime = { components: source.components.map(() => ({ props: {} })) } as unknown as SceneFile;
  const before = new RuntimeSceneRecords(source, runtime);
  // Accessing an untouched payload would reveal a whole-scene comparison or
  // reference-index rebuild. ID-map construction can still read its ID.
  Object.defineProperty(source.components[3], "props", {
    get: () => {
      throw Error("untouched component scanned");
    }
  });
  Object.defineProperty(source.entities[1], "name", {
    enumerable: true,
    get: () => {
      throw Error("untouched entity compared");
    }
  });
  const next = {
    ...source,
    components: [{ ...source.components[0], props: { target: { $component: "c" } } }, ...source.components.slice(1)]
  };
  const mutation = { components: ["a"] };
  const after = new RuntimeSceneRecords(next, runtime, before, mutation);
  const changes = new RuntimeSceneChanges(before, after, mutation);
  expect(changes.components).toEqual(new Set(["a", "b", "c"]));
  expect(changes.entities).toEqual(new Set(["root"]));
  expect(before.consumers.get("b")).toEqual(new Set(["a"]));
  expect(before.consumers.has("c")).toBe(false);
  expect(after.consumers.has("b")).toBe(false);
  expect(after.consumers.get("c")).toEqual(new Set(["a"]));
  expect(after.consumers.get("a")).toBe(before.consumers.get("a"));
});
