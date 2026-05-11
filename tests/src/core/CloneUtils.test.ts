import { Entity, MeshRenderer, Script, Signal, assignmentClone, deepClone, ignoreClone } from "@galacean/engine-core";
import { WebGLEngine } from "@galacean/engine";
import { describe, expect, it } from "vitest";

class TestScript extends Script {
  targetEntity: Entity;
  targetRenderer: MeshRenderer;
  externalEntity: Entity;
  externalRenderer: MeshRenderer;
  deepChild: Entity;
  selfRef: Entity;
  speed: number;
  name2: string;
  flag: boolean;
  data: object;
}

/** Script with multiple entity/component refs pointing to different nodes */
class MultiRefScript extends Script {
  entityA: Entity;
  entityB: Entity;
  rendererA: MeshRenderer;
  rendererB: MeshRenderer;
}

/** Script where the same entity is referenced by multiple properties */
class DuplicateRefScript extends Script {
  ref1: Entity;
  ref2: Entity;
}

/** Script with null/undefined entity/component refs */
class NullRefScript extends Script {
  nullEntity: Entity = null;
  undefinedEntity: Entity;
  nullRenderer: MeshRenderer = null;
  someNumber: number = 0;
}

/** Script referencing a sibling entity (not parent/child, but sibling under clone root) */
class SiblingRefScript extends Script {
  sibling: Entity;
  siblingRenderer: MeshRenderer;
}

/** Script with a mix of decorated and undecorated entity refs */
class DecoratedRefScript extends Script {
  // Undecorated — should auto-remap via _remap
  autoRemapEntity: Entity;

  // @assignmentClone — should still auto-remap since _remap takes priority
  @assignmentClone
  assignedEntity: Entity;

  // @ignoreClone — should still auto-remap since _remap takes priority
  @ignoreClone
  ignoredEntity: Entity;
}

/** Script with a @deepClone array of entities */
class ArrayRefScript extends Script {
  @deepClone
  entities: Entity[] = [];
}

/** Script with Component self-reference */
class SelfComponentRefScript extends Script {
  selfScript: SelfComponentRefScript;
}

/** Script referencing another Script on a different entity */
class CrossScriptRefScript extends Script {
  otherScript: TestScript;
}

/** Script with a nested plain object containing entity refs */
class NestedObjectScript extends Script {
  @deepClone
  config: { target: Entity; label: string } = { target: null, label: "" };
}

/** Script for testing multiple same-type components on one entity */
class CounterScript extends Script {
  value: number = 0;
  partner: CounterScript;
  targetEntity: Entity;
}

/** Script that references a CounterScript */
class CounterRefScript extends Script {
  counter: CounterScript;
}

/** Handler script used for Signal structured binding tests */
class ClickHandler extends Script {
  callCount = 0;
  lastPrefix: string = "";

  handleClick(): void {
    this.callCount++;
  }

  handleClickWithPrefix(prefix: string): void {
    this.callCount++;
    this.lastPrefix = prefix;
  }
}

/** Script with a Signal property */
class SignalScript extends Script {
  @deepClone
  readonly onFire = new Signal<[number]>();
}

describe("Clone remap", async () => {
  const engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
  const scene = engine.sceneManager.activeScene;
  engine.run();

  describe("Basic Entity/Component remap", () => {
    it("script undecorated Entity ref should remap to cloned entity", () => {
      const rootEntity = scene.createRootEntity("root");
      const parent = rootEntity.createChild("parent");
      const child = parent.createChild("child");
      const script = parent.addComponent(TestScript);
      script.targetEntity = child;

      const clonedParent = parent.clone();
      const clonedScript = clonedParent.getComponent(TestScript);
      const clonedChild = clonedParent.children[0];

      expect(clonedScript.targetEntity).not.eq(child);
      expect(clonedScript.targetEntity).eq(clonedChild);
      expect(clonedScript.targetEntity.name).eq("child");

      rootEntity.destroy();
    });

    it("script undecorated Component ref should remap to cloned component", () => {
      const rootEntity = scene.createRootEntity("root");
      const parent = rootEntity.createChild("parent");
      const child = parent.createChild("child");
      const meshRenderer = child.addComponent(MeshRenderer);
      const script = parent.addComponent(TestScript);
      script.targetRenderer = meshRenderer;

      const clonedParent = parent.clone();
      const clonedScript = clonedParent.getComponent(TestScript);
      const clonedChild = clonedParent.children[0];
      const clonedMeshRenderer = clonedChild.getComponent(MeshRenderer);

      expect(clonedScript.targetRenderer).not.eq(meshRenderer);
      expect(clonedScript.targetRenderer).eq(clonedMeshRenderer);

      rootEntity.destroy();
    });

    it("script ref to entity outside hierarchy should keep original", () => {
      const rootEntity = scene.createRootEntity("root");
      const parent = rootEntity.createChild("parent");
      const external = rootEntity.createChild("external");
      const script = parent.addComponent(TestScript);
      script.externalEntity = external;

      const clonedParent = parent.clone();
      const clonedScript = clonedParent.getComponent(TestScript);

      expect(clonedScript.externalEntity).eq(external);

      rootEntity.destroy();
    });

    it("script ref to component outside hierarchy should keep original", () => {
      const rootEntity = scene.createRootEntity("root");
      const parent = rootEntity.createChild("parent");
      const external = rootEntity.createChild("external");
      const externalMR = external.addComponent(MeshRenderer);
      const script = parent.addComponent(TestScript);
      script.externalRenderer = externalMR;

      const clonedParent = parent.clone();
      const clonedScript = clonedParent.getComponent(TestScript);

      expect(clonedScript.externalRenderer).eq(externalMR);

      rootEntity.destroy();
    });

    it("deep hierarchy entity ref should remap correctly", () => {
      const rootEntity = scene.createRootEntity("root");
      const parent = rootEntity.createChild("parent");
      const child = parent.createChild("child");
      const grandchild = child.createChild("grandchild");
      const script = parent.addComponent(TestScript);
      script.deepChild = grandchild;

      const clonedParent = parent.clone();
      const clonedScript = clonedParent.getComponent(TestScript);
      const clonedGrandchild = clonedParent.children[0].children[0];

      expect(clonedScript.deepChild).not.eq(grandchild);
      expect(clonedScript.deepChild).eq(clonedGrandchild);
      expect(clonedScript.deepChild.name).eq("grandchild");

      rootEntity.destroy();
    });

    it("script ref to self entity (clone root) should remap", () => {
      const rootEntity = scene.createRootEntity("root");
      const parent = rootEntity.createChild("parent");
      const script = parent.addComponent(TestScript);
      script.selfRef = parent;

      const clonedParent = parent.clone();
      const clonedScript = clonedParent.getComponent(TestScript);

      expect(clonedScript.selfRef).not.eq(parent);
      expect(clonedScript.selfRef).eq(clonedParent);

      rootEntity.destroy();
    });

    it("primitive and plain object props should not be affected", () => {
      const rootEntity = scene.createRootEntity("root");
      const parent = rootEntity.createChild("parent");
      const script = parent.addComponent(TestScript);
      const obj = { x: 1 };
      script.speed = 42;
      script.name2 = "test";
      script.flag = true;
      script.data = obj;

      const clonedParent = parent.clone();
      const clonedScript = clonedParent.getComponent(TestScript);

      expect(clonedScript.speed).eq(42);
      expect(clonedScript.name2).eq("test");
      expect(clonedScript.flag).eq(true);
      expect(clonedScript.data).eq(obj);

      rootEntity.destroy();
    });
  });

  describe("Multiple and duplicate refs", () => {
    it("multiple entity/component refs on same script all remap independently", () => {
      const rootEntity = scene.createRootEntity("root");
      const parent = rootEntity.createChild("parent");
      const childA = parent.createChild("childA");
      const childB = parent.createChild("childB");
      const mrA = childA.addComponent(MeshRenderer);
      const mrB = childB.addComponent(MeshRenderer);
      const script = parent.addComponent(MultiRefScript);
      script.entityA = childA;
      script.entityB = childB;
      script.rendererA = mrA;
      script.rendererB = mrB;

      const cloned = parent.clone();
      const cs = cloned.getComponent(MultiRefScript);

      expect(cs.entityA).not.eq(childA);
      expect(cs.entityB).not.eq(childB);
      expect(cs.entityA.name).eq("childA");
      expect(cs.entityB.name).eq("childB");
      expect(cs.entityA).eq(cloned.children[0]);
      expect(cs.entityB).eq(cloned.children[1]);
      expect(cs.rendererA).eq(cloned.children[0].getComponent(MeshRenderer));
      expect(cs.rendererB).eq(cloned.children[1].getComponent(MeshRenderer));

      rootEntity.destroy();
    });

    it("two properties referencing the same entity both remap to the same cloned entity", () => {
      const rootEntity = scene.createRootEntity("root");
      const parent = rootEntity.createChild("parent");
      const child = parent.createChild("child");
      const script = parent.addComponent(DuplicateRefScript);
      script.ref1 = child;
      script.ref2 = child;

      const cloned = parent.clone();
      const cs = cloned.getComponent(DuplicateRefScript);

      expect(cs.ref1).not.eq(child);
      expect(cs.ref1).eq(cs.ref2);
      expect(cs.ref1).eq(cloned.children[0]);

      rootEntity.destroy();
    });
  });

  describe("Null and undefined refs", () => {
    it("null entity/component refs should not crash and remain null", () => {
      const rootEntity = scene.createRootEntity("root");
      const parent = rootEntity.createChild("parent");
      const script = parent.addComponent(NullRefScript);

      const cloned = parent.clone();
      const cs = cloned.getComponent(NullRefScript);

      expect(cs.nullEntity).eq(null);
      expect(cs.nullRenderer).eq(null);
      expect(cs.someNumber).eq(0);

      rootEntity.destroy();
    });
  });

  describe("Sibling entity refs", () => {
    it("ref to sibling entity under clone root should remap", () => {
      const rootEntity = scene.createRootEntity("root");
      const parent = rootEntity.createChild("parent");
      const childA = parent.createChild("childA");
      const childB = parent.createChild("childB");
      const mrB = childB.addComponent(MeshRenderer);
      const script = childA.addComponent(SiblingRefScript);
      script.sibling = childB;
      script.siblingRenderer = mrB;

      const cloned = parent.clone();
      const clonedChildA = cloned.children[0];
      const clonedChildB = cloned.children[1];
      const cs = clonedChildA.getComponent(SiblingRefScript);

      expect(cs.sibling).not.eq(childB);
      expect(cs.sibling).eq(clonedChildB);
      expect(cs.siblingRenderer).not.eq(mrB);
      expect(cs.siblingRenderer).eq(clonedChildB.getComponent(MeshRenderer));

      rootEntity.destroy();
    });
  });

  describe("Clone decorator interaction with _remap", () => {
    it("@assignmentClone entity ref still gets remapped via _remap priority", () => {
      const rootEntity = scene.createRootEntity("root");
      const parent = rootEntity.createChild("parent");
      const child = parent.createChild("child");
      const script = parent.addComponent(DecoratedRefScript);
      script.assignedEntity = child;

      const cloned = parent.clone();
      const cs = cloned.getComponent(DecoratedRefScript);

      expect(cs.assignedEntity).not.eq(child);
      expect(cs.assignedEntity).eq(cloned.children[0]);

      rootEntity.destroy();
    });

    it("@ignoreClone entity ref still gets remapped via _remap priority", () => {
      const rootEntity = scene.createRootEntity("root");
      const parent = rootEntity.createChild("parent");
      const child = parent.createChild("child");
      const script = parent.addComponent(DecoratedRefScript);
      script.ignoredEntity = child;

      const cloned = parent.clone();
      const cs = cloned.getComponent(DecoratedRefScript);

      expect(cs.ignoredEntity).not.eq(child);
      expect(cs.ignoredEntity).eq(cloned.children[0]);

      rootEntity.destroy();
    });

    it("undecorated entity ref remaps correctly", () => {
      const rootEntity = scene.createRootEntity("root");
      const parent = rootEntity.createChild("parent");
      const child = parent.createChild("child");
      const script = parent.addComponent(DecoratedRefScript);
      script.autoRemapEntity = child;

      const cloned = parent.clone();
      const cs = cloned.getComponent(DecoratedRefScript);

      expect(cs.autoRemapEntity).not.eq(child);
      expect(cs.autoRemapEntity).eq(cloned.children[0]);

      rootEntity.destroy();
    });

    it("@ignoreClone entity ref outside hierarchy stays original", () => {
      const rootEntity = scene.createRootEntity("root");
      const parent = rootEntity.createChild("parent");
      const external = rootEntity.createChild("external");
      const script = parent.addComponent(DecoratedRefScript);
      script.ignoredEntity = external;

      const cloned = parent.clone();
      const cs = cloned.getComponent(DecoratedRefScript);

      expect(cs.ignoredEntity).eq(external);

      rootEntity.destroy();
    });
  });

  describe("@deepClone array of entities", () => {
    it("deep cloned entity array should remap internal refs", () => {
      const rootEntity = scene.createRootEntity("root");
      const parent = rootEntity.createChild("parent");
      const childA = parent.createChild("childA");
      const childB = parent.createChild("childB");
      const script = parent.addComponent(ArrayRefScript);
      script.entities = [childA, childB];

      const cloned = parent.clone();
      const cs = cloned.getComponent(ArrayRefScript);

      expect(cs.entities).not.eq(script.entities);
      expect(cs.entities.length).eq(2);
      expect(cs.entities[0]).not.eq(childA);
      expect(cs.entities[1]).not.eq(childB);
      expect(cs.entities[0]).eq(cloned.children[0]);
      expect(cs.entities[1]).eq(cloned.children[1]);

      rootEntity.destroy();
    });

    it("deep cloned entity array with external ref keeps original", () => {
      const rootEntity = scene.createRootEntity("root");
      const parent = rootEntity.createChild("parent");
      const child = parent.createChild("child");
      const external = rootEntity.createChild("external");
      const script = parent.addComponent(ArrayRefScript);
      script.entities = [child, external];

      const cloned = parent.clone();
      const cs = cloned.getComponent(ArrayRefScript);

      expect(cs.entities[0]).eq(cloned.children[0]);
      expect(cs.entities[1]).eq(external);

      rootEntity.destroy();
    });

    it("deep cloned empty entity array stays empty", () => {
      const rootEntity = scene.createRootEntity("root");
      const parent = rootEntity.createChild("parent");
      const script = parent.addComponent(ArrayRefScript);
      script.entities = [];

      const cloned = parent.clone();
      const cs = cloned.getComponent(ArrayRefScript);

      expect(cs.entities).not.eq(script.entities);
      expect(cs.entities.length).eq(0);

      rootEntity.destroy();
    });
  });

  describe("Component self and cross references", () => {
    it("script referencing itself should remap to cloned script", () => {
      const rootEntity = scene.createRootEntity("root");
      const parent = rootEntity.createChild("parent");
      const script = parent.addComponent(SelfComponentRefScript);
      script.selfScript = script;

      const cloned = parent.clone();
      const cs = cloned.getComponent(SelfComponentRefScript);

      expect(cs.selfScript).not.eq(script);
      expect(cs.selfScript).eq(cs);

      rootEntity.destroy();
    });

    it("script referencing another script on child entity should remap", () => {
      const rootEntity = scene.createRootEntity("root");
      const parent = rootEntity.createChild("parent");
      const child = parent.createChild("child");
      const childScript = child.addComponent(TestScript);
      const script = parent.addComponent(CrossScriptRefScript);
      script.otherScript = childScript;

      const cloned = parent.clone();
      const cs = cloned.getComponent(CrossScriptRefScript);
      const clonedChildScript = cloned.children[0].getComponent(TestScript);

      expect(cs.otherScript).not.eq(childScript);
      expect(cs.otherScript).eq(clonedChildScript);

      rootEntity.destroy();
    });

    it("script referencing external script should keep original", () => {
      const rootEntity = scene.createRootEntity("root");
      const parent = rootEntity.createChild("parent");
      const external = rootEntity.createChild("external");
      const externalScript = external.addComponent(TestScript);
      const script = parent.addComponent(CrossScriptRefScript);
      script.otherScript = externalScript;

      const cloned = parent.clone();
      const cs = cloned.getComponent(CrossScriptRefScript);

      expect(cs.otherScript).eq(externalScript);

      rootEntity.destroy();
    });
  });

  describe("Nested @deepClone object with entity refs", () => {
    it("entity ref inside deep cloned plain object should remap", () => {
      const rootEntity = scene.createRootEntity("root");
      const parent = rootEntity.createChild("parent");
      const child = parent.createChild("child");
      const script = parent.addComponent(NestedObjectScript);
      script.config = { target: child, label: "hello" };

      const cloned = parent.clone();
      const cs = cloned.getComponent(NestedObjectScript);

      expect(cs.config).not.eq(script.config);
      expect(cs.config.label).eq("hello");
      expect(cs.config.target).not.eq(child);
      expect(cs.config.target).eq(cloned.children[0]);

      rootEntity.destroy();
    });

    it("entity ref inside deep cloned object pointing outside keeps original", () => {
      const rootEntity = scene.createRootEntity("root");
      const parent = rootEntity.createChild("parent");
      const external = rootEntity.createChild("external");
      const script = parent.addComponent(NestedObjectScript);
      script.config = { target: external, label: "ext" };

      const cloned = parent.clone();
      const cs = cloned.getComponent(NestedObjectScript);

      expect(cs.config.target).eq(external);
      expect(cs.config.label).eq("ext");

      rootEntity.destroy();
    });
  });

  describe("Signal clone with structured bindings", () => {
    it("@deepClone Signal should not copy closure listeners", () => {
      const rootEntity = scene.createRootEntity("root");
      const parent = rootEntity.createChild("parent");
      const script = parent.addComponent(SignalScript);
      let called = false;
      script.onFire.on(() => {
        called = true;
      });

      const cloned = parent.clone();
      const cs = cloned.getComponent(SignalScript);

      expect(cs.onFire).not.eq(script.onFire);
      cs.onFire.invoke(1);
      expect(called).eq(false);

      rootEntity.destroy();
    });

    it("@deepClone Signal should remap structured binding target to cloned hierarchy", () => {
      const rootEntity = scene.createRootEntity("root");
      const parent = rootEntity.createChild("parent");
      const handlerEntity = parent.createChild("handler");
      const handler = handlerEntity.addComponent(ClickHandler);
      const script = parent.addComponent(SignalScript);
      script.onFire.on(handler, "handleClick");

      const cloned = parent.clone();
      const cs = cloned.getComponent(SignalScript);
      const clonedHandler = cloned.findByName("handler").getComponent(ClickHandler);

      cs.onFire.invoke(1);
      expect(clonedHandler.callCount).eq(1);
      expect(handler.callCount).eq(0);

      rootEntity.destroy();
    });

    it("@deepClone Signal should keep external structured binding target", () => {
      const rootEntity = scene.createRootEntity("root");
      const parent = rootEntity.createChild("parent");
      const external = rootEntity.createChild("external");
      const externalHandler = external.addComponent(ClickHandler);
      const script = parent.addComponent(SignalScript);
      script.onFire.on(externalHandler, "handleClick");

      const cloned = parent.clone();
      const cs = cloned.getComponent(SignalScript);

      cs.onFire.invoke(1);
      expect(externalHandler.callCount).eq(1);

      rootEntity.destroy();
    });

    it("@deepClone Signal should remap structured binding with pre-resolved args", () => {
      const rootEntity = scene.createRootEntity("root");
      const parent = rootEntity.createChild("parent");
      const handlerEntity = parent.createChild("handler");
      const handler = handlerEntity.addComponent(ClickHandler);
      const script = parent.addComponent(SignalScript);
      script.onFire.on(handler, "handleClickWithPrefix", "myPrefix");

      const cloned = parent.clone();
      const cs = cloned.getComponent(SignalScript);
      const clonedHandler = cloned.findByName("handler").getComponent(ClickHandler);

      cs.onFire.invoke(1);
      expect(clonedHandler.callCount).eq(1);
      expect(clonedHandler.lastPrefix).eq("myPrefix");
      expect(handler.callCount).eq(0);

      rootEntity.destroy();
    });

    it("@deepClone Signal should preserve once flag on structured binding", () => {
      const rootEntity = scene.createRootEntity("root");
      const parent = rootEntity.createChild("parent");
      const handlerEntity = parent.createChild("handler");
      const handler = handlerEntity.addComponent(ClickHandler);
      const script = parent.addComponent(SignalScript);
      script.onFire.once(handler, "handleClick");

      const cloned = parent.clone();
      const cs = cloned.getComponent(SignalScript);
      const clonedHandler = cloned.findByName("handler").getComponent(ClickHandler);

      cs.onFire.invoke(1);
      expect(clonedHandler.callCount).eq(1);
      cs.onFire.invoke(2);
      expect(clonedHandler.callCount).eq(1); // once: removed after first call

      rootEntity.destroy();
    });
  });

  describe("Clone hierarchy integrity", () => {
    it("clone preserves children count and names", () => {
      const rootEntity = scene.createRootEntity("root");
      const parent = rootEntity.createChild("parent");
      parent.createChild("a");
      parent.createChild("b");
      parent.createChild("c");

      const cloned = parent.clone();
      expect(cloned.children.length).eq(3);
      expect(cloned.children[0].name).eq("a");
      expect(cloned.children[1].name).eq("b");
      expect(cloned.children[2].name).eq("c");

      rootEntity.destroy();
    });

    it("clone of deeply nested hierarchy preserves structure", () => {
      const rootEntity = scene.createRootEntity("root");
      const a = rootEntity.createChild("a");
      const b = a.createChild("b");
      const c = b.createChild("c");
      const d = c.createChild("d");

      const cloned = a.clone();
      expect(cloned.children[0].name).eq("b");
      expect(cloned.children[0].children[0].name).eq("c");
      expect(cloned.children[0].children[0].children[0].name).eq("d");

      rootEntity.destroy();
    });

    it("script on child entity with ref to parent should remap", () => {
      const rootEntity = scene.createRootEntity("root");
      const parent = rootEntity.createChild("parent");
      const child = parent.createChild("child");
      const script = child.addComponent(TestScript);
      script.targetEntity = parent;

      const cloned = parent.clone();
      const clonedChild = cloned.children[0];
      const cs = clonedChild.getComponent(TestScript);

      expect(cs.targetEntity).not.eq(parent);
      expect(cs.targetEntity).eq(cloned);

      rootEntity.destroy();
    });

    it("multiple scripts on different entities with cross-refs all remap correctly", () => {
      const rootEntity = scene.createRootEntity("root");
      const parent = rootEntity.createChild("parent");
      const childA = parent.createChild("childA");
      const childB = parent.createChild("childB");

      const scriptA = childA.addComponent(TestScript);
      scriptA.targetEntity = childB;

      const scriptB = childB.addComponent(TestScript);
      scriptB.targetEntity = childA;

      const cloned = parent.clone();
      const clonedA = cloned.children[0];
      const clonedB = cloned.children[1];
      const csA = clonedA.getComponent(TestScript);
      const csB = clonedB.getComponent(TestScript);

      expect(csA.targetEntity).eq(clonedB);
      expect(csB.targetEntity).eq(clonedA);

      rootEntity.destroy();
    });
  });

  describe("Single entity with multiple same-type components", () => {
    it("clone preserves multiple same-type components with correct state", () => {
      const rootEntity = scene.createRootEntity("root");
      const entity = rootEntity.createChild("entity");
      const script1 = entity.addComponent(CounterScript);
      const script2 = entity.addComponent(CounterScript);
      script1.value = 10;
      script2.value = 20;

      const cloned = entity.clone();
      const clonedScripts = cloned.getComponents(CounterScript, []);

      expect(clonedScripts.length).eq(2);
      expect(clonedScripts[0].value).eq(10);
      expect(clonedScripts[1].value).eq(20);
      expect(clonedScripts[0]).not.eq(script1);
      expect(clonedScripts[1]).not.eq(script2);

      rootEntity.destroy();
    });

    it("ref to second component of same type should remap correctly", () => {
      const rootEntity = scene.createRootEntity("root");
      const parent = rootEntity.createChild("parent");
      const child = parent.createChild("child");
      const counter1 = child.addComponent(CounterScript);
      const counter2 = child.addComponent(CounterScript);
      counter1.value = 1;
      counter2.value = 2;

      const refScript = parent.addComponent(CounterRefScript);
      refScript.counter = counter2;

      const cloned = parent.clone();
      const clonedRef = cloned.getComponent(CounterRefScript);
      const clonedCounters = cloned.children[0].getComponents(CounterScript, []);

      expect(clonedRef.counter).not.eq(counter2);
      expect(clonedRef.counter).eq(clonedCounters[1]);
      expect(clonedRef.counter.value).eq(2);

      rootEntity.destroy();
    });

    it("ref to first component of same type should remap correctly", () => {
      const rootEntity = scene.createRootEntity("root");
      const parent = rootEntity.createChild("parent");
      const child = parent.createChild("child");
      const counter1 = child.addComponent(CounterScript);
      const counter2 = child.addComponent(CounterScript);
      counter1.value = 100;
      counter2.value = 200;

      const refScript = parent.addComponent(CounterRefScript);
      refScript.counter = counter1;

      const cloned = parent.clone();
      const clonedRef = cloned.getComponent(CounterRefScript);
      const clonedCounters = cloned.children[0].getComponents(CounterScript, []);

      expect(clonedRef.counter).not.eq(counter1);
      expect(clonedRef.counter).eq(clonedCounters[0]);
      expect(clonedRef.counter.value).eq(100);

      rootEntity.destroy();
    });

    it("cross-references between multiple same-type components on same entity", () => {
      const rootEntity = scene.createRootEntity("root");
      const entity = rootEntity.createChild("entity");
      const script1 = entity.addComponent(CounterScript);
      const script2 = entity.addComponent(CounterScript);
      script1.value = 1;
      script2.value = 2;
      script1.partner = script2;
      script2.partner = script1;

      const cloned = entity.clone();
      const clonedScripts = cloned.getComponents(CounterScript, []);

      expect(clonedScripts[0].partner).eq(clonedScripts[1]);
      expect(clonedScripts[1].partner).eq(clonedScripts[0]);
      expect(clonedScripts[0].partner).not.eq(script2);
      expect(clonedScripts[1].partner).not.eq(script1);

      rootEntity.destroy();
    });

    it("self-reference among multiple same-type components remaps to correct clone", () => {
      const rootEntity = scene.createRootEntity("root");
      const entity = rootEntity.createChild("entity");
      const script1 = entity.addComponent(CounterScript);
      const script2 = entity.addComponent(CounterScript);
      script1.partner = script1;
      script2.partner = script2;

      const cloned = entity.clone();
      const clonedScripts = cloned.getComponents(CounterScript, []);

      expect(clonedScripts[0].partner).eq(clonedScripts[0]);
      expect(clonedScripts[1].partner).eq(clonedScripts[1]);

      rootEntity.destroy();
    });

    it("multiple same-type components with entity refs all remap independently", () => {
      const rootEntity = scene.createRootEntity("root");
      const parent = rootEntity.createChild("parent");
      const childA = parent.createChild("childA");
      const childB = parent.createChild("childB");
      const script1 = parent.addComponent(CounterScript);
      const script2 = parent.addComponent(CounterScript);
      script1.targetEntity = childA;
      script2.targetEntity = childB;

      const cloned = parent.clone();
      const clonedScripts = cloned.getComponents(CounterScript, []);

      expect(clonedScripts[0].targetEntity).eq(cloned.children[0]);
      expect(clonedScripts[1].targetEntity).eq(cloned.children[1]);
      expect(clonedScripts[0].targetEntity.name).eq("childA");
      expect(clonedScripts[1].targetEntity.name).eq("childB");

      rootEntity.destroy();
    });

    it("@deepClone array referencing specific component among same-type siblings", () => {
      const rootEntity = scene.createRootEntity("root");
      const parent = rootEntity.createChild("parent");
      const child = parent.createChild("child");
      const counter1 = child.addComponent(CounterScript);
      const counter2 = child.addComponent(CounterScript);
      const counter3 = child.addComponent(CounterScript);
      counter1.value = 1;
      counter2.value = 2;
      counter3.value = 3;

      const arrayScript = parent.addComponent(ArrayRefScript);
      // Note: ArrayRefScript uses Entity[], but we test component indexing
      // via direct component references instead
      const refScript1 = parent.addComponent(CounterRefScript);
      const refScript2 = parent.addComponent(CounterRefScript);
      refScript1.counter = counter1;
      refScript2.counter = counter3;

      const cloned = parent.clone();
      const clonedRefs = cloned.getComponents(CounterRefScript, []);
      const clonedCounters = cloned.children[0].getComponents(CounterScript, []);

      expect(clonedRefs[0].counter).eq(clonedCounters[0]);
      expect(clonedRefs[0].counter.value).eq(1);
      expect(clonedRefs[1].counter).eq(clonedCounters[2]);
      expect(clonedRefs[1].counter.value).eq(3);

      rootEntity.destroy();
    });
  });
});
