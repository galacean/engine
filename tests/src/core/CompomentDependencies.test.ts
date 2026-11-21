import {
  AssetType,
  Camera,
  dependentComponents,
  DependentMode,
  Entity,
  HingeJoint,
  Loader,
  MeshRenderer,
  Rigidbody,
  Script
} from "@galacean/engine-core";
import { WebGLEngine } from "@galacean/engine";
import type { PrefabResource } from "@galacean/engine-loader";
import { describe, beforeAll, expect, it } from "vitest";

const canvasDOM = document.createElement("canvas");
canvasDOM.width = 1024;
canvasDOM.height = 1024;

describe("Component dependencies test", function () {
  let entity: Entity;
  let camera: Camera;
  beforeAll(async function () {
    const engine = await WebGLEngine.create({ canvas: canvasDOM });
    entity = engine.sceneManager.activeScene.createRootEntity();
    camera = entity.addComponent(Camera);
  });

  it("Super dependencies add check", () => {
    expect(() => {
      entity.addComponent(CustomScriptB);
    }).throw(`Should add ${MeshRenderer.name} before adding CustomScriptA`);
  });

  it("Super dependencies remove check", () => {
    expect(() => {
      const meshRenderer = entity.addComponent(MeshRenderer);
      entity.addComponent(CustomScriptB);
      meshRenderer.destroy();
    }).throw(`Should remove CustomScriptA before remove ${MeshRenderer.name}`);
  });

  it("reorders unsatisfied dependencies in Entity constructor without duplicating AutoAdd components", () => {
    const ordered = new Entity(entity.engine, "ordered", CustomAutoAddScript, Camera);
    expect(ordered.getComponents(Camera, [])).toHaveLength(1);
    expect(ordered.getComponents(CustomAutoAddScript, [])).toHaveLength(1);
    expect(ordered._components.indexOf(ordered.getComponent(Camera)!)).toBeLessThan(
      ordered._components.indexOf(ordered.getComponent(CustomAutoAddScript)!)
    );
    expect(() => ordered.destroy()).not.toThrow();

    const checkOnly = new Entity(entity.engine, "check-only", CustomScriptB, MeshRenderer);
    expect(checkOnly.getComponents(MeshRenderer, [])).toHaveLength(1);
    expect(checkOnly.getComponents(CustomScriptB, [])).toHaveLength(1);
    expect(() => checkOnly.destroy()).not.toThrow();
  });

  it.each([false, true])(
    "uses the declared AutoAdd provider when the subtype is blocked (indirect: %s)",
    async (indirect) => {
      const destroyed: string[] = [];
      class Provider extends Script {}
      @dependentComponents(Provider, DependentMode.AutoAdd)
      class Consumer extends Script {
        override onDestroy(): void {
          destroyed.push("consumer");
        }
      }
      @dependentComponents(Consumer)
      class Bridge extends Script {}
      @dependentComponents(indirect ? Bridge : Consumer, indirect ? DependentMode.AutoAdd : DependentMode.CheckOnly)
      class SpecializedProvider extends Provider {
        override onDestroy(): void {
          destroyed.push("specialized");
        }
      }
      const direct = new Entity(entity.engine, "direct", Consumer, SpecializedProvider);
      expect(direct.getComponents(Provider, [])).toHaveLength(2);
      direct.destroy();
      expect(destroyed).toEqual(["specialized", "consumer"]);
      destroyed.length = 0;

      Loader.registerClass("AutoAddConsumer", Consumer);
      Loader.registerClass("AutoAddSpecializedProvider", SpecializedProvider);
      const url = URL.createObjectURL(
        new Blob([
          JSON.stringify({
            version: "2.0",
            root: 0,
            refs: [],
            entities: [{ components: [0, 1] }],
            components: [{ type: "AutoAddConsumer" }, { type: "AutoAddSpecializedProvider" }]
          })
        ])
      );
      try {
        const prefab = await entity.engine.resourceManager.load<PrefabResource>({ url, type: AssetType.Prefab });
        const instance = prefab.instantiate();
        expect(instance.getComponents(Provider, [])).toHaveLength(2);
        instance.destroy();
        expect(destroyed).toEqual(["specialized", "consumer"]);
        expect(prefab.destroy()).toBe(true);
      } finally {
        URL.revokeObjectURL(url);
      }
    }
  );

  it("reuses a requested AutoAdd subtype when its own prerequisite can be added first", () => {
    class Provider extends Script {}
    @dependentComponents(Provider, DependentMode.AutoAdd)
    class Consumer extends Script {}
    class Prerequisite extends Script {}
    @dependentComponents(Prerequisite)
    class SpecializedProvider extends Provider {}

    const direct = new Entity(entity.engine, "direct", Consumer, SpecializedProvider, Prerequisite);
    const source = new Entity(entity.engine, "clone-source");
    const first = source.addComponent(Provider);
    source.addComponent(Consumer);
    source.addComponent(Prerequisite);
    source.addComponent(SpecializedProvider);
    first.destroy();
    const clone = source.clone();
    try {
      for (const owner of [direct, clone]) {
        expect(owner.getComponents(Provider, [])).toHaveLength(1);
        expect(owner.getComponent(Provider)).toBeInstanceOf(SpecializedProvider);
      }
    } finally {
      clone.destroy();
      source.destroy();
      direct.destroy();
    }
  });

  it("fails a missing dependency before running later AutoAdd constructors", () => {
    let constructions = 0;
    class Missing extends Script {}
    class AutoAdded extends Script {
      constructor(entity: Entity) {
        super(entity);
        constructions++;
      }
    }
    @dependentComponents(AutoAdded, DependentMode.AutoAdd)
    class Base extends Script {}
    @dependentComponents(Missing)
    class Invalid extends Base {}
    class Other extends Script {}

    expect(() => new Entity(entity.engine, "invalid", Invalid, Other)).toThrow("Should add Missing");
    expect(constructions).toBe(0);
  });

  it("uses a requested Rigidbody subtype through a transitive Joint dependency", () => {
    @dependentComponents(HingeJoint)
    class HingeConsumer extends Script {}
    class SpecializedBody extends Rigidbody {}

    const owner = new Entity(entity.engine, "hinge", HingeConsumer, HingeJoint, SpecializedBody);
    try {
      expect(owner.getComponent(Rigidbody)).toBeInstanceOf(SpecializedBody);
      expect(owner.getComponent(HingeConsumer)).not.toBeNull();
    } finally {
      owner.destroy();
    }
  });

  it("destroys the dependent before its last provider after another provider was removed", () => {
    const engine = entity.engine;
    const root = engine.sceneManager.activeScene.createRootEntity();
    const destroyed: string[] = [];
    let updates = 0;
    class Provider extends Script {
      override onUpdate(): void {
        updates++;
      }
      override onDestroy(): void {
        destroyed.push("provider");
      }
    }
    @dependentComponents(Provider)
    class Consumer extends Script {
      override onDestroy(): void {
        destroyed.push("consumer");
      }
    }
    const first = root.addComponent(Provider);
    const consumer = root.addComponent(Consumer);
    const last = root.addComponent(Provider);
    first.destroy();
    destroyed.length = 0;
    engine.update();
    expect(updates).toBe(1);

    root.destroy();
    expect(consumer.destroyed).toBe(true);
    expect(last.destroyed).toBe(true);
    expect(destroyed).toEqual(["consumer", "provider"]);
    engine.update();
    expect(updates).toBe(1);
  });

  it("preserves exact component slot mapping when cloning an entity with extra dependency instances after a dependent", () => {
    const source = new Entity(entity.engine, "clone-source");
    const first = source.addComponent(MeshRenderer);
    const dependent = source.addComponent(CustomScriptA);
    const second = source.addComponent(MeshRenderer);
    first.priority = 1;
    second.priority = 2;

    const clone = source.clone();
    const clonedRenderers = clone.getComponents(MeshRenderer, []);
    expect(clonedRenderers).toHaveLength(2);
    expect(clonedRenderers[0].priority).toBe(1);
    expect(clonedRenderers[1].priority).toBe(2);
    expect(clone._components.indexOf(clonedRenderers[0])).toBe(source._components.indexOf(first));
    expect(clone._components.indexOf(clone.getComponent(CustomScriptA)!)).toBe(source._components.indexOf(dependent));
    expect(clone._components.indexOf(clonedRenderers[1])).toBe(source._components.indexOf(second));
    source.destroy();
    clone.destroy();
  });

  it("preserves the outer component types when a constructor starts another clone", () => {
    const source = new Entity(entity.engine, "source");
    const nestedSource = new Entity(entity.engine, "nested-source");
    let nested: Entity | undefined;
    class NestedFirst extends Script {}
    class NestedSecond extends Script {}
    class Value extends Script {
      value = 0;
    }
    class Reentrant extends Script {
      constructor(owner: Entity) {
        super(owner);
        if (owner !== source) nested = nestedSource.clone();
      }
    }
    nestedSource.addComponent(NestedFirst);
    nestedSource.addComponent(NestedSecond);
    source.addComponent(Reentrant);
    source.addComponent(Value).value = 7;

    const clone = source.clone();
    try {
      expect(clone.getComponent(Value)?.value).toBe(7);
      expect(nested?.getComponent(NestedSecond)).toBeInstanceOf(NestedSecond);
    } finally {
      clone.destroy();
      nested?.destroy();
      source.destroy();
      nestedSource.destroy();
    }
  });

  it.each([false, true])("destroys a prefab replacement before its prerequisite (inherited: %s)", async (inherited) => {
    const destroyed: string[] = [];
    class Prerequisite extends Script {
      override onDestroy(): void {
        destroyed.push("prerequisite");
      }
    }
    class Provider extends Script {}
    @dependentComponents(Prerequisite, DependentMode.CheckOnly)
    class Replacement extends Provider {
      override onDestroy(): void {
        destroyed.push("replacement");
      }
    }
    @dependentComponents(Provider, DependentMode.CheckOnly)
    class Consumer extends Script {
      override onDestroy(): void {
        destroyed.push("consumer");
      }
    }
    Loader.registerClass("ReplacementPrerequisite", Prerequisite);
    Loader.registerClass("ReplacementProvider", Provider);
    Loader.registerClass("ReplacementComponent", Replacement);
    Loader.registerClass("ReplacementConsumer", Consumer);

    const basePath = `component-replacement-base-${inherited}.prefab`;
    const prerequisite = { type: "ReplacementPrerequisite" };
    const baseComponents = [{ type: "ReplacementProvider" }, { type: "ReplacementConsumer" }];
    const addedComponents = [{ type: "ReplacementComponent" }];
    (inherited ? baseComponents : addedComponents).push(prerequisite);
    const baseUrl = URL.createObjectURL(
      new Blob(
        [
          JSON.stringify({
            version: "2.0",
            root: 0,
            refs: [],
            entities: [{ components: baseComponents.map((_, i) => i) }],
            components: baseComponents
          })
        ],
        { type: "application/json" }
      )
    );
    const instanceUrl = URL.createObjectURL(
      new Blob(
        [
          JSON.stringify({
            version: "2.0",
            root: 0,
            refs: [{ url: basePath }],
            entities: [
              {
                instance: {
                  asset: 0,
                  overrides: {
                    removedComponents: [{ path: [], selectors: [{ type: "ReplacementProvider", index: 0 }] }],
                    addedComponents: addedComponents.map((_, i) => ({ target: [], component: i }))
                  }
                }
              }
            ],
            components: addedComponents
          })
        ],
        { type: "application/json" }
      )
    );
    const { resourceManager } = entity.engine;
    resourceManager.registerVirtualResources([{ virtualPath: basePath, path: baseUrl, type: AssetType.Prefab }]);
    try {
      const prefab = await resourceManager.load<PrefabResource>({ url: instanceUrl, type: AssetType.Prefab });
      const instance = prefab.instantiate();
      instance.destroy();
      expect(destroyed).toEqual(["consumer", "replacement", "prerequisite"]);
      destroyed.length = 0;
      expect(prefab.destroy()).toBe(true);
      expect(destroyed).toEqual(["consumer", "replacement", "prerequisite"]);
    } finally {
      URL.revokeObjectURL(instanceUrl);
      URL.revokeObjectURL(baseUrl);
    }
  });
});

@dependentComponents(MeshRenderer, DependentMode.CheckOnly)
export class CustomScriptA extends Script {}

export class CustomScriptB extends CustomScriptA {}

@dependentComponents(Camera, DependentMode.AutoAdd)
class CustomAutoAddScript extends Script {}
