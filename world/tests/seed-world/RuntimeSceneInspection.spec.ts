import { toAgentValue } from "@galacean/engine-ai-chat/ai-chat/agent-values.ts";
import { Component, Entity, Loader, Vector3, type Engine, type Scene } from "@galacean/engine";
import { expect, it, vi } from "vitest";
vi.mock("@galacean/engine", async () => ({
  ...(await import("@galacean/engine-core")),
  ...(await import("@galacean/engine-math"))
}));
import { RuntimeSceneInspection } from "@galacean/engine-runtime-editor/runtime-inspection/runtime-scene-inspection.ts";
import { createSeedWorldRuntimeTools } from "../../demos/seed-world/agent-adapter/tools/runtime-tools";
import type { SeedWorldAgentApplication } from "../../demos/seed-world/agent-adapter/SeedWorldAgentApplication";
import { JavaScriptAgentScriptRuntime } from "@galacean/engine-ai-chat/ai-chat/agent-script-runtime.ts";

function fixture() {
  const engine = {} as Engine;
  const root = new Entity(engine, "object"),
    child = root.createChild("mesh");
  const scene = { rootEntities: [root] } as unknown as Scene;
  (root as any)._scene = scene;
  (child as any)._scene = scene;
  class Behavior extends Component {
    speed = 2;
    direction = new Vector3(1, 2, 3);
    linked = root;
    data = new Uint8Array(100000);
    _internal = "hidden";
    getterCalls = 0;
    get current() {
      this.getterCalls++;
      return this.speed;
    }
    act() {
      throw new Error("Must not execute methods");
    }
  }
  const behavior = child.addComponent(Behavior);
  const inspection = new RuntimeSceneInspection(scene, (object) =>
    object === root ? { scene: "Main.scene", entityId: "authored-root" } : undefined
  );
  return { root, child, scene, behavior, inspection };
}

it("uses Engine instanceId and discovers current hierarchy without a scene capture", () => {
  const f = fixture(), target = f.inspection.target(f.behavior);
  expect(target.entityId).toBe(f.child.instanceId);
  expect(target.componentId).toBe(f.behavior.instanceId);
  f.child.transform.setPosition(3, 0, 0);
  const node = f.inspection.inspectEntity(target.entityId);
  expect(node).toMatchObject({ alive: true, observedAt: "live", entity: { parentId: f.root.instanceId, position: [3, 0, 0] } });
  expect(f.inspection.inspectEntity(node.entity!.parentId!).entity?.authoring).toEqual({ scene: "Main.scene", entityId: "authored-root",
    componentQuery: {scene: "Main.scene", entityId: "authored-root"} });
  expect(f.inspection.queryComponents(target.entityId, "Behavior").components).toHaveLength(1);
  expect(f.inspection.queryComponents(target.entityId, "Unknown").components).toEqual([]);
});
it("invalidates destroyed objects instead of resolving same-named replacements", () => {
  const f = fixture(), id = f.inspection.id(f.child);
  (f.child as any)._pendingDestroy = true;
  expect(f.inspection.inspectEntity(id)).toMatchObject({ status: "unavailable", alive: false });
  const replacement = new Entity({} as Engine, f.child.name);
  expect(f.inspection.id(replacement)).not.toBe(id);
  expect(f.inspection.children(f.inspection.id(f.root)).entities).toEqual([]);
});

it("reads only requested public properties, keeps references and bounds buffers", () => {
  const f = fixture(),
    id = f.inspection.id(f.behavior);
  expect(f.behavior.getterCalls).toBe(0);
  expect(f.inspection.readComponent(id, ["direction", "linked", "data"]).values).toMatchObject({
    direction: { x: 1, y: 2, z: 3 },
    linked: { entityId: f.inspection.id(f.root) },
    data: { length: 100000, truncated: true }
  });
  expect(f.inspection.readComponent(id, ["current"]).values.current).toBe(2);
  expect(f.behavior.getterCalls).toBe(1);
  expect(() => f.inspection.readComponent(id, ["_internal"])).toThrow("Unknown readable");
  expect(() => f.inspection.readComponent(id, ["act"])).toThrow("Unknown readable");
});

it("dispatches generic inspection through the execute tool boundary without Engine objects", async () => {
  const f = fixture(),
    target = f.inspection.target(f.behavior, 4, "opaque-key");
  const application = {
    requireRuntimeInspection: () => f.inspection,

  } as unknown as SeedWorldAgentApplication;
  const tools = createSeedWorldRuntimeTools(application);
  const query = tools.find((tool) => tool.name === "runtime.component.query")!;
  const input = query.parseInput({ entityId: target.entityId, type: "Behavior" });
  const result = query.parseOutput(await query.execute(input, { signal: new AbortController().signal }));
  expect(structuredClone(result)).toMatchObject({
    observedAt: "live",
    components: [{ id: target.componentId, type: "Behavior" }]
  });
  const runtime = new JavaScriptAgentScriptRuntime();
  const output = await runtime.execute({
    id: "inspect",
    source: `
      const entity = await tools.runtime.entity.inspect({entityId:${JSON.stringify(target.entityId)}});
      const result = await tools.runtime.component.query({entityId:entity.entity.entityId, type:"Behavior"});
      return await tools.runtime.component.read({componentId:result.components[0].componentId,fields:["speed"]});
    `,
    signal: new AbortController().signal,
    timeoutMs: 5000,
    maxToolCalls: 5,
    toolBindings: tools.map((tool) => ({
      name: tool.name,
      effect: tool.effect,
      invoke: async (input, signal) => ({
        ok: true as const,
        value: toAgentValue(tool.parseOutput(await tool.execute(tool.parseInput(input), { signal })))
      })
    }))
  });
  expect(output).toMatchObject({ ok: true, output: { status: "found", values: { speed: 2 } } });
});

it("accepts legacy IDs but rejects ambiguous parameters, wrong identity kinds and destroyed targets", async () => {
  const f = fixture(), target = f.inspection.target(f.behavior);
  const application = {requireRuntimeInspection: () => f.inspection} as unknown as SeedWorldAgentApplication;
  const tools = createSeedWorldRuntimeTools(application);
  const inspect = tools.find(tool => tool.name === "runtime.entity.inspect")!;
  const read = tools.find(tool => tool.name === "runtime.component.read")!;
  const run = async (tool: typeof inspect, input: unknown) => tool.parseOutput(await tool.execute(tool.parseInput(input), {signal: new AbortController().signal}));
  expect(await run(inspect, {id:target.entityId})).toEqual(await run(inspect, {entityId:target.entityId}));
  expect(await run(read, {id:target.componentId, fields:["speed"]})).toEqual(await run(read, {componentId:target.componentId, fields:["speed"]}));
  for (const input of [{id:target.entityId, entityId:target.entityId}, {componentId:target.componentId}, {entityId:"authored-root"}, {}]) {
    expect(() => inspect.parseInput(input)).toThrow();
  }
  expect(() => read.parseInput({id:target.componentId, componentId:target.componentId, fields:[]})).toThrow();
  expect(() => read.parseInput({entityId:target.entityId, fields:[]})).toThrow();
  expect(await run(inspect, {entityId:target.componentId})).toMatchObject({status:"unavailable",alive:false});
  expect(await run(read, {componentId:target.entityId,fields:[]})).toMatchObject({status:"unavailable",component:null});
  (f.child as any)._pendingDestroy = true;
  expect(await run(inspect, {entityId:target.entityId})).toMatchObject({status:"unavailable",alive:false});
  expect(await run(read, {componentId:target.componentId,fields:[]})).toMatchObject({status:"unavailable",component:null});
});

it("returns an exact author component selector only when the projection owns a mapping", () => {
  const f = fixture();
  const inspection = new RuntimeSceneInspection(f.scene, object => object === f.behavior
    ? {scene:"Main.scene",entityId:"authored-owner",componentId:"authored-component"} : undefined);
  const target = inspection.target(f.behavior);
  expect(inspection.inspectEntity(target.entityId).entity?.authoring).toBeUndefined();
  const record = inspection.queryComponents(target.entityId).components.find(item => item.componentId === target.componentId)!;
  expect(record.componentId).toBe(target.componentId);
  expect(record.authoring?.componentQuery).toEqual({scene:"Main.scene",entityId:"authored-owner",id:"authored-component"});
  inspection.dispose();
});

it("does not report pending subtrees or components as live", () => {
  const f = fixture();
  (f.behavior as any)._pendingDestroy = true;
  expect(f.inspection.queryComponents(f.inspection.id(f.child), "Behavior").components).toEqual([]);
  (f.root as any)._pendingDestroy = true;
  expect(f.inspection.inspectEntity(f.inspection.id(f.child)).alive).toBe(false);
  expect(f.inspection.children(undefined).entities).toEqual([]);
});

it("uses registered component types and does not evaluate nested getters", () => {
  const f = fixture();
  Loader.registerClass("project/Behavior.ts", f.behavior.constructor as typeof Component);
  Object.defineProperty(f.behavior, "nested", {
    value: {
      get constructor() {
        throw new Error("must not run");
      },
      get field() {
        throw new Error("must not run");
      },
      value: 3
    }
  });
  expect(f.inspection.target(f.behavior).componentType).toBe("project/Behavior.ts");
  expect(f.inspection.queryComponents(f.inspection.id(f.child), "project/Behavior.ts").components).toHaveLength(1);
  expect(f.inspection.readComponent(f.inspection.id(f.behavior), ["nested"]).values).toMatchObject({
    nested: { type: "Object", value: 3 }
  });
});
