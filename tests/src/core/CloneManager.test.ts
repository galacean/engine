import {
  Burst,
  DataObject,
  Entity,
  Logger,
  MeshRenderer,
  ParticleCompositeCurve,
  ParticleCompositeGradient,
  ParticleRenderer,
  Script,
  Signal,
  Texture2D,
  assignmentClone,
  deepClone,
  ignoreClone
} from "@galacean/engine-core";
import * as EngineCore from "@galacean/engine-core";
import * as EngineMath from "@galacean/engine-math";
import * as EngineUI from "@galacean/engine-ui";
import { Color, Vector3 } from "@galacean/engine-math";
import { WebGLEngine } from "@galacean/engine";
import { describe, expect, it, vi } from "vitest";

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
  // Undecorated — Entity type default (Remap) applies
  autoRemapEntity: Entity;

  // @assignmentClone — field decorator wins over the type default: shares the source reference
  @assignmentClone
  assignedEntity: Entity;

  // @ignoreClone — field decorator wins over the type default: keeps the clone's own value
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

  handleClickWithPrefix(arg: number, prefix: string): void {
    this.callCount++;
    this.lastPrefix = prefix;
  }
}

/** Script with a Signal property */
class SignalScript extends Script {
  @deepClone
  readonly onFire = new Signal<[number]>();
}

/** Script with function-valued fields, standalone and inside containers */
class HandlerScript extends Script {
  onTick: () => void;
  handlers: Array<() => void> = [];
  handlerSet: Set<() => void> = new Set();
  config: { onDone: (() => void) | null; x: number } = { onDone: null, x: 0 };
}

/** Script whose constructor establishes its own bound handler */
class BoundHandlerScript extends Script {
  tickCount = 0;
  boundTick = this._tick.bind(this);

  private _tick(): void {
    this.tickCount++;
  }
}

/** Script holding binary data views */
class BinaryScript extends Script {
  view: DataView;
  bytes: Float32Array;
}

/**
 * Script holding a shared ReferResource, honoring the slot-ownership contract the same way
 * engine components do: acquire on assignment, release on destroy. The clone gate adds +1 for
 * the cloned backing slot, which the same onDestroy release balances.
 */
class ResourceRefScript extends Script {
  private _texture: Texture2D;

  get texture(): Texture2D {
    return this._texture;
  }

  set texture(value: Texture2D) {
    if (this._texture !== value) {
      (this._texture as any)?._addReferCount(-1);
      (value as any)?._addReferCount(1);
      this._texture = value;
    }
  }

  override onDestroy(): void {
    this.texture = null;
  }
}

/** Script whose constructor presets an owned counted resource into a clonable slot. */
class PresetTextureScript extends Script {
  static created: Texture2D[] = [];

  texture: Texture2D;

  constructor(entity: Entity) {
    super(entity);
    const texture = new Texture2D(entity.engine, 1, 1);
    (texture as any)._addReferCount(1);
    PresetTextureScript.created.push(texture);
    this.texture = texture;
  }
}

/** Script with two fields aliasing one typed array (identity must survive the clone). */
class AliasedBinaryScript extends Script {
  a: Float32Array;
  b: Float32Array;
}

/** Unregistered user value type without any counting API — must share, never count. */
class SharedConfig {
  value = 1;
}

/** Script holding a user Assignment-registered object. */
class SharedConfigScript extends Script {
  config: SharedConfig = null;
}

/** Script whose constructor presets a counted resource WITHOUT acquiring it (contract violation). */
class UnownedPresetScript extends Script {
  static created: Texture2D[] = [];

  tex: Texture2D;

  constructor(entity: Entity) {
    super(entity);
    const texture = new Texture2D(entity.engine, 1, 1);
    UnownedPresetScript.created.push(texture);
    this.tex = texture;
  }
}

/** User DataObject whose constructor dereferences a required argument (contract violation). */
class ParamDeepConfig extends DataObject {
  target: string;

  constructor(source: { id: string }) {
    super();
    this.target = source.id;
  }
}

/** Script holding plain data whose payload happens to carry a `copyFrom` key. */
class CopyFromDataScript extends Script {
  config: any = null;
}

/** Script whose binary fields alias class-level shared default tables (preset === source). */
class SharedDefaultTableScript extends Script {
  static DEFAULT_WEIGHTS = new Float32Array([1, 2, 3]);
  static DEFAULT_VIEW = new DataView(new ArrayBuffer(4));
  weights: Float32Array = SharedDefaultTableScript.DEFAULT_WEIGHTS;
  view: DataView = SharedDefaultTableScript.DEFAULT_VIEW;
}

/** Script misusing @deepClone on an Entity ref (must fall back to remap, never construct) */
class DeepEntityRefScript extends Script {
  @deepClone
  target: Entity;
}

/** Script misusing @deepClone on an engine-bound asset (must fall back to sharing, never construct) */
class DeepAssetRefScript extends Script {
  @deepClone
  texture: Texture2D;
}

/** Script with an @assignmentClone function field preset by the constructor */
class AssignedHandlerScript extends Script {
  @assignmentClone
  handler: () => void = this._noop.bind(this);

  private _noop(): void {}
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

    it("primitive props copied by value; plain object deep cloned", () => {
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
      // plain object is deep cloned into an independent copy, not shared
      expect(clonedScript.data).not.eq(obj);
      expect(clonedScript.data.x).eq(1);

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

  describe("Field decorators take priority over Entity/Component remap", () => {
    it("@assignmentClone entity ref shares the source reference (decorator wins)", () => {
      const rootEntity = scene.createRootEntity("root");
      const parent = rootEntity.createChild("parent");
      const child = parent.createChild("child");
      const script = parent.addComponent(DecoratedRefScript);
      script.assignedEntity = child;

      const cloned = parent.clone();
      const cs = cloned.getComponent(DecoratedRefScript);

      expect(cs.assignedEntity).eq(child);

      rootEntity.destroy();
    });

    it("@ignoreClone entity ref keeps the clone's own value (decorator wins)", () => {
      const rootEntity = scene.createRootEntity("root");
      const parent = rootEntity.createChild("parent");
      const child = parent.createChild("child");
      const script = parent.addComponent(DecoratedRefScript);
      script.ignoredEntity = child;

      const cloned = parent.clone();
      const cs = cloned.getComponent(DecoratedRefScript);

      expect(cs.ignoredEntity).eq(undefined);

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

    it("@ignoreClone entity ref outside hierarchy is ignored the same way", () => {
      const rootEntity = scene.createRootEntity("root");
      const parent = rootEntity.createChild("parent");
      const external = rootEntity.createChild("external");
      const script = parent.addComponent(DecoratedRefScript);
      script.ignoredEntity = external;

      const cloned = parent.clone();
      const cs = cloned.getComponent(DecoratedRefScript);

      expect(cs.ignoredEntity).eq(undefined);

      rootEntity.destroy();
    });

    it("@deepClone entity ref falls back to remap instead of constructing a broken entity", () => {
      const rootEntity = scene.createRootEntity("root");
      const parent = rootEntity.createChild("parent");
      const child = parent.createChild("child");
      const external = rootEntity.createChild("external");
      const script = parent.addComponent(DeepEntityRefScript);

      // In-subtree ref remaps to the clone's entity.
      script.target = child;
      let cloned = parent.clone();
      expect(cloned.getComponent(DeepEntityRefScript).target).eq(cloned.children[0]);

      // Out-of-subtree ref keeps the original reference (never `new Entity()` without engine).
      script.target = external;
      cloned = parent.clone();
      expect(cloned.getComponent(DeepEntityRefScript).target).eq(external);
      expect(cloned.getComponent(DeepEntityRefScript).target.engine).eq(engine);

      rootEntity.destroy();
    });

    it("@deepClone asset ref falls back to sharing instead of constructing a broken asset", () => {
      const rootEntity = scene.createRootEntity("root");
      const parent = rootEntity.createChild("parent");
      const script = parent.addComponent(DeepAssetRefScript);
      const texture = new Texture2D(engine, 4, 4);
      const baseline = texture.refCount;
      script.texture = texture;

      const cloned = parent.clone();
      const cs = cloned.getComponent(DeepAssetRefScript);

      // Shared, never `new Texture2D()` without an engine; the slot behaves like an
      // undecorated asset slot (owns one reference under the slot contract).
      expect(cs.texture).eq(texture);
      expect(texture.refCount).eq(baseline + 1);

      rootEntity.destroy();
      texture.destroy(true);
    });

    it("@assignmentClone function field shares the source function (decorator wins over reuse)", () => {
      const rootEntity = scene.createRootEntity("root");
      const parent = rootEntity.createChild("parent");
      const script = parent.addComponent(AssignedHandlerScript);
      const custom = () => {};
      script.handler = custom;

      const cloned = parent.clone();
      const cs = cloned.getComponent(AssignedHandlerScript);

      expect(cs.handler).eq(custom);

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

    it("@deepClone Signal shares non-entity object args deterministically", () => {
      const rootEntity = scene.createRootEntity("root");
      const parent = rootEntity.createChild("parent");
      const handlerEntity = parent.createChild("handler");
      const handler = handlerEntity.addComponent(ClickHandler);
      const script = parent.addComponent(SignalScript);
      const payload = { hp: 5 };
      script.onFire.on(handler, "handleClickWithPrefix", payload);

      const cloned = parent.clone();
      const cs = cloned.getComponent(SignalScript);
      const clonedHandler = cloned.findByName("handler").getComponent(ClickHandler);

      cs.onFire.invoke(1);
      // Non-entity object args are shared with the source, independent of field-walk order.
      expect(clonedHandler.lastPrefix).eq(payload);

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

  describe("Function fields", () => {
    it("plain function field is shared, not lost", () => {
      const rootEntity = scene.createRootEntity("root");
      const parent = rootEntity.createChild("parent");
      const script = parent.addComponent(HandlerScript);
      const fn = () => {};
      script.onTick = fn;

      const cloned = parent.clone();
      const cs = cloned.getComponent(HandlerScript);

      expect(cs.onTick).eq(fn);

      rootEntity.destroy();
    });

    it("functions inside arrays / sets / plain objects survive cloning", () => {
      const rootEntity = scene.createRootEntity("root");
      const parent = rootEntity.createChild("parent");
      const script = parent.addComponent(HandlerScript);
      const fn = () => {};
      script.handlers = [fn];
      script.handlerSet = new Set([fn]);
      script.config = { onDone: fn, x: 1 };

      const cloned = parent.clone();
      const cs = cloned.getComponent(HandlerScript);

      expect(cs.handlers).not.eq(script.handlers);
      expect(cs.handlers.length).eq(1);
      expect(cs.handlers[0]).eq(fn);
      expect(cs.handlerSet).not.eq(script.handlerSet);
      expect(cs.handlerSet.has(fn)).eq(true);
      expect(cs.config).not.eq(script.config);
      expect(cs.config.onDone).eq(fn);
      expect(cs.config.x).eq(1);

      rootEntity.destroy();
    });

    it("constructor-bound function field keeps the clone's own binding", () => {
      const rootEntity = scene.createRootEntity("root");
      const parent = rootEntity.createChild("parent");
      const script = parent.addComponent(BoundHandlerScript);

      const cloned = parent.clone();
      const cs = cloned.getComponent(BoundHandlerScript);

      expect(cs.boundTick).not.eq(script.boundTick);
      cs.boundTick();
      expect(cs.tickCount).eq(1);
      expect(script.tickCount).eq(0);

      rootEntity.destroy();
    });
  });

  describe("Math value-type registration completeness", () => {
    it("every math export with copyFrom is registered @defaultCloneMode(Deep)", async () => {
      const mathExports = await import("@galacean/engine-math");
      const unregistered: string[] = [];
      for (const [name, exported] of Object.entries(mathExports)) {
        if (typeof exported !== "function" || !(exported as any).prototype) continue;
        if (typeof (exported as any).prototype.copyFrom !== "function") continue;
        if ((exported as any).prototype._defaultCloneMode === undefined) unregistered.push(name);
      }
      // A math value type missing from CloneManager's registration list falls back to
      // Assignment sharing — mutable state silently shared between source and clone.
      expect(unregistered).deep.eq([]);
    });
  });

  describe("Runtime-container type defaults (Ignore)", () => {
    it("an undecorated DisorderedArray slot keeps the clone's own instance", async () => {
      const { DisorderedArray } = await import("@galacean/engine-core");
      const rootEntity = scene.createRootEntity("root");
      const parent = rootEntity.createChild("parent");
      const script = parent.addComponent(HandlerScript);
      const runtimeList = new DisorderedArray<number>();
      runtimeList.add(1);
      (script as any).runtimeList = runtimeList;

      const cloned = parent.clone();
      const cs = cloned.getComponent(HandlerScript) as any;

      // Type-level Ignore: the slot is neither shared nor deep-cloned — the clone keeps its
      // own (absent) value instead of aliasing the source's runtime container.
      expect(cs.runtimeList).not.eq(runtimeList);
      expect(cs.runtimeList).eq(undefined);
      expect(runtimeList.length).eq(1);

      rootEntity.destroy();
    });
  });

  describe("Null-prototype containers", () => {
    it("Object.create(null) fields deep-clone as data containers, not shared references", () => {
      const rootEntity = scene.createRootEntity("root");
      const parent = rootEntity.createChild("parent");
      const child = parent.createChild("child");
      const script = parent.addComponent(HandlerScript);
      const bag = Object.create(null);
      bag.hp = 5;
      bag.target = child;
      (script as any).bag = bag;

      const cloned = parent.clone();
      const cs = cloned.getComponent(HandlerScript) as any;

      expect(cs.bag).not.eq(bag);
      expect(Object.getPrototypeOf(cs.bag)).eq(null);
      expect(cs.bag.hp).eq(5);
      // Entity refs nested in the bag remap like in any other container.
      expect(cs.bag.target).eq(cloned.children[0]);
      cs.bag.hp = 9;
      expect(bag.hp).eq(5);

      rootEntity.destroy();
    });
  });

  describe("deepCloneObject decorator awareness", () => {
    it("respects @ignoreClone on the source type's fields", async () => {
      const { CloneManager } = await import("@galacean/engine-core");

      class Bag {
        kept = 1;
        @ignoreClone
        runtime = 1;
      }
      const source = new Bag();
      source.kept = 42;
      source.runtime = 42;
      const target = new Bag();

      CloneManager.deepCloneObject(source, target, new Map());
      expect(target.kept).eq(42);
      expect(target.runtime).eq(1);
    });
  });

  describe("Aliasing topology", () => {
    it("one instance referenced three times clones into one instance referenced three times", () => {
      const rootEntity = scene.createRootEntity("root");
      const parent = rootEntity.createChild("parent");
      const script = parent.addComponent(HandlerScript);
      const vec = new Vector3(1, 2, 3);
      (script as any).points = [vec, vec, vec];

      const cloned = parent.clone();
      const cs = cloned.getComponent(HandlerScript) as any;

      // One NEW instance, shared by all three slots — the reference topology is preserved.
      expect(cs.points[0]).not.eq(vec);
      expect(cs.points[0]).eq(cs.points[1]);
      expect(cs.points[1]).eq(cs.points[2]);
      expect(cs.points[0].x).eq(1);

      // Mutating through one slot is visible through the others, matching the source's behavior.
      cs.points[0].x = 9;
      expect(cs.points[2].x).eq(9);
      expect(vec.x).eq(1);

      rootEntity.destroy();
    });
  });

  describe("Binary data fields", () => {
    it("DataView field clones by bytes without crashing", () => {
      const rootEntity = scene.createRootEntity("root");
      const parent = rootEntity.createChild("parent");
      const script = parent.addComponent(BinaryScript);
      const buffer = new ArrayBuffer(8);
      const view = new DataView(buffer);
      view.setFloat32(0, 3.5);
      view.setUint16(4, 42);
      script.view = view;

      const cloned = parent.clone();
      const cs = cloned.getComponent(BinaryScript);

      expect(cs.view).not.eq(view);
      expect(cs.view.buffer).not.eq(buffer);
      expect(cs.view.getFloat32(0)).eq(3.5);
      expect(cs.view.getUint16(4)).eq(42);
      cs.view.setUint16(4, 7);
      expect(view.getUint16(4)).eq(42);

      rootEntity.destroy();
    });

    it("typed array field clones into an independent copy", () => {
      const rootEntity = scene.createRootEntity("root");
      const parent = rootEntity.createChild("parent");
      const script = parent.addComponent(BinaryScript);
      script.bytes = new Float32Array([1, 2, 3]);

      const cloned = parent.clone();
      const cs = cloned.getComponent(BinaryScript);

      expect(cs.bytes).not.eq(script.bytes);
      expect(Array.from(cs.bytes)).deep.eq([1, 2, 3]);
      cs.bytes[0] = 9;
      expect(script.bytes[0]).eq(1);

      rootEntity.destroy();
    });

    it("aliased typed arrays keep identity through the clone", () => {
      const rootEntity = scene.createRootEntity("root");
      const parent = rootEntity.createChild("parent");
      const script = parent.addComponent(AliasedBinaryScript);
      const shared = new Float32Array([1, 2, 3]);
      script.a = shared;
      script.b = shared;

      const cloned = parent.clone();
      const cs = cloned.getComponent(AliasedBinaryScript);

      expect(cs.a).not.eq(shared);
      expect(cs.a).eq(cs.b);
      expect(Array.from(cs.a)).deep.eq([1, 2, 3]);

      rootEntity.destroy();
    });

    it("typed-array preset aliasing the source value still yields a fresh copy", () => {
      const rootEntity = scene.createRootEntity("root");
      const parent = rootEntity.createChild("parent");
      const script = parent.addComponent(SharedDefaultTableScript);

      const cloned = parent.clone();
      const cs = cloned.getComponent(SharedDefaultTableScript);

      expect(cs.weights).not.eq(SharedDefaultTableScript.DEFAULT_WEIGHTS);
      expect(Array.from(cs.weights)).deep.eq([1, 2, 3]);
      cs.weights[0] = 9;
      expect(SharedDefaultTableScript.DEFAULT_WEIGHTS[0]).eq(1);
      expect(script.weights[0]).eq(1);
      expect(cs.view).not.eq(SharedDefaultTableScript.DEFAULT_VIEW);

      rootEntity.destroy();
    });
  });

  describe("Plain data carrying copyFrom-shaped keys", () => {
    it("plain object with a string copyFrom key deep-clones without crashing", () => {
      const rootEntity = scene.createRootEntity("root");
      const parent = rootEntity.createChild("parent");
      const script = parent.addComponent(CopyFromDataScript);
      script.config = { copyFrom: "nodeA", other: 1 };

      const cloned = parent.clone();
      const cc = cloned.getComponent(CopyFromDataScript).config;
      expect(cc).not.eq(script.config);
      expect(cc.copyFrom).eq("nodeA");
      expect(cc.other).eq(1);

      rootEntity.destroy();
    });

    it("plain object with a function copyFrom key shares the function and clones the rest", () => {
      const rootEntity = scene.createRootEntity("root");
      const parent = rootEntity.createChild("parent");
      const script = parent.addComponent(CopyFromDataScript);
      const fn = () => 42;
      script.config = { copyFrom: fn, n: 2 };

      const cloned = parent.clone();
      const cc = cloned.getComponent(CopyFromDataScript).config;
      expect(cc).not.eq(script.config);
      expect(cc.copyFrom).eq(fn);
      expect(cc.n).eq(2);

      rootEntity.destroy();
    });

    it("null-prototype object with a copyFrom key deep-clones as null-prototype", () => {
      const rootEntity = scene.createRootEntity("root");
      const parent = rootEntity.createChild("parent");
      const script = parent.addComponent(CopyFromDataScript);
      const data = Object.create(null);
      data.copyFrom = "x";
      data.v = 2;
      script.config = data;

      const cloned = parent.clone();
      const cc = cloned.getComponent(CopyFromDataScript).config;
      expect(cc).not.eq(data);
      expect(Object.getPrototypeOf(cc)).eq(null);
      expect(cc.copyFrom).eq("x");
      expect(cc.v).eq(2);

      rootEntity.destroy();
    });
  });

  describe("Parameter-constructed Deep values as container elements", () => {
    it("clones gradients and curves held in arrays / maps without a reusable preset", () => {
      const rootEntity = scene.createRootEntity("root");
      const parent = rootEntity.createChild("parent");
      const script = parent.addComponent(CopyFromDataScript);
      const gradient = new ParticleCompositeGradient(new Color(1, 0, 0, 1));
      const curve = new ParticleCompositeCurve(0.5);
      script.config = { gradients: [gradient], curves: new Map([["a", curve]]) };

      const cloned = parent.clone();
      const cc = cloned.getComponent(CopyFromDataScript).config;
      expect(cc.gradients[0]).not.eq(gradient);
      expect(cc.gradients[0].mode).eq(gradient.mode);
      expect(cc.gradients[0].constant.r).eq(1);
      expect(cc.curves.get("a")).not.eq(curve);
      expect(cc.curves.get("a").constant).eq(0.5);

      rootEntity.destroy();
    });

    it("a Deep type that cannot construct bare fails with the contract named", () => {
      const rootEntity = scene.createRootEntity("root");
      const parent = rootEntity.createChild("parent");
      const script = parent.addComponent(CopyFromDataScript);
      script.config = { items: [new ParamDeepConfig({ id: "a" })] };

      expect(() => parent.clone()).toThrowError(/bare-construct "ParamDeepConfig"/);

      rootEntity.destroy();
    });

    it("a host-bound instance in a container remaps when its engine slot clones first", () => {
      const rootEntity = scene.createRootEntity("root");
      const parent = rootEntity.createChild("parent");
      // Renderer added first: its generator/module tree enters the identity map before the
      // script's fields walk, so the container reference dedups onto the cloned module.
      const renderer = parent.addComponent(ParticleRenderer);
      const script = parent.addComponent(CopyFromDataScript);
      script.config = { modules: [renderer.generator.main] };

      const cloned = parent.clone();
      const clonedModule = cloned.getComponent(CopyFromDataScript).config.modules[0];
      expect(clonedModule).eq(cloned.getComponent(ParticleRenderer).generator.main);
      expect(clonedModule).not.eq(renderer.generator.main);

      rootEntity.destroy();
    });

    it("a host-bound instance in a container fails with the named error when no host precedes", () => {
      const rootEntity = scene.createRootEntity("root");
      const parent = rootEntity.createChild("parent");
      // Script added first: the container walks before any engine slot registers the module,
      // so the gate must bare-construct a host-bound structure — rejected with the contract
      // named (sharing must be declared via @assignmentClone).
      const script = parent.addComponent(CopyFromDataScript);
      const renderer = parent.addComponent(ParticleRenderer);
      script.config = { modules: [renderer.generator.main] };

      expect(() => parent.clone()).toThrowError(/bare-construct "MainModule"/);

      rootEntity.destroy();
    });

    it("every exported Deep-registered type constructs bare (gate contract)", () => {
      // The gate creates container elements and preset-less slots with `new Type()` and then
      // populates every field, so a Deep-registered type MUST construct without arguments.
      // Exemptions are engine-bound structural types the gate only ever clones against a
      // same-type constructor preset (`reusable`) — each entry states why it cannot be bare.
      const exempt = new Set<string>([
        // Physics shapes construct a PhysicsMaterial and need an initialized physics backend —
        // bare-constructible in a real runtime, just not in this physics-less test engine.
        "ColliderShape",
        "BoxColliderShape",
        "SphereColliderShape",
        "CapsuleColliderShape",
        "PlaneColliderShape",
        "MeshColliderShape",
        // Host-bound structural types wired to their host at construction — in their engine
        // slots the gate clones them against the component's same-type constructor preset; a
        // preset-less occurrence (e.g. a user container) fails with the named bare-construction
        // error by design (share explicitly via @assignmentClone instead).
        "ParticleGenerator",
        "MainModule",
        "VelocityOverLifetimeModule",
        "SizeOverLifetimeModule",
        "LimitVelocityOverLifetimeModule",
        "NoiseModule"
      ]);
      const failures: string[] = [];
      const packages: [string, Record<string, any>][] = [
        ["core", EngineCore],
        ["math", EngineMath],
        ["ui", EngineUI]
      ];
      for (const [pkg, ns] of packages) {
        for (const [name, exported] of Object.entries(ns)) {
          if (typeof exported !== "function" || !exported.prototype) continue;
          // math carries only Deep markers; core/ui Deep types are the DataObject family
          const isDeep =
            pkg === "math" ? exported.prototype._defaultCloneMode !== undefined : exported.prototype instanceof DataObject;
          if (!isDeep) continue;
          if (exempt.has(name)) continue;
          try {
            new exported();
          } catch (e) {
            failures.push(`${pkg}/${name}: ${(e as Error).message}`);
          }
        }
      }
      expect(failures).deep.eq([]);
    });

    it("orbital velocity fields deep-clone through the type default", () => {
      const rootEntity = scene.createRootEntity("root");
      const parent = rootEntity.createChild("parent");
      const renderer = parent.addComponent(ParticleRenderer);
      const vol = renderer.generator.velocityOverLifetime;
      vol.orbitalX = new ParticleCompositeCurve(1, 2);
      vol.centerOffset.set(3, 4, 5);

      const cloned = parent.clone();
      const clonedVol = cloned.getComponent(ParticleRenderer).generator.velocityOverLifetime;
      expect(clonedVol.orbitalX).not.eq(vol.orbitalX);
      expect(clonedVol.orbitalX.constantMin).eq(1);
      expect(clonedVol.orbitalX.constantMax).eq(2);
      expect(clonedVol.centerOffset).not.eq(vol.centerOffset);
      expect(clonedVol.centerOffset.z).eq(5);

      rootEntity.destroy();
    });

    it("clones the emission bursts array through the engine path", () => {
      const rootEntity = scene.createRootEntity("root");
      const parent = rootEntity.createChild("parent");
      const renderer = parent.addComponent(ParticleRenderer);
      renderer.generator.emission.addBurst(new Burst(0.5, new ParticleCompositeCurve(30)));

      const cloned = parent.clone();
      const clonedBursts = cloned.getComponent(ParticleRenderer).generator.emission.bursts;
      expect(clonedBursts.length).eq(1);
      expect(clonedBursts[0]).not.eq(renderer.generator.emission.bursts[0]);
      expect(clonedBursts[0].time).eq(0.5);
      expect(clonedBursts[0].count.constant).eq(30);

      rootEntity.destroy();
    });
  });

  describe("Script-held ReferResource", () => {
    it("cloned slot owns one reference; the script's own contract releases it", () => {
      const rootEntity = scene.createRootEntity("root");
      const parent = rootEntity.createChild("parent");
      const script = parent.addComponent(ResourceRefScript);
      const texture = new Texture2D(engine, 4, 4);
      script.texture = texture;
      expect(texture.refCount).eq(1);

      const cloned = parent.clone();
      const cs = cloned.getComponent(ResourceRefScript);

      // Shared by reference; the cloned slot owns one count — same contract as engine components.
      expect(cs.texture).eq(texture);
      expect(texture.refCount).eq(2);

      // Releasing on destroy is the script class's responsibility (onDestroy → setter -1).
      cloned.destroy();
      expect(texture.refCount).eq(1);

      parent.destroy();
      expect(texture.refCount).eq(0);

      rootEntity.destroy();
      texture.destroy();
    });

    it("a replaced owned preset releases its count even when the source slot is empty", () => {
      PresetTextureScript.created.length = 0;
      const rootEntity = scene.createRootEntity("root");
      const parent = rootEntity.createChild("parent");
      const script = parent.addComponent(PresetTextureScript);
      // The source empties the slot, releasing its own preset ownership first.
      (script.texture as any)._addReferCount(-1);
      script.texture = null;

      const cloned = parent.clone();
      expect(PresetTextureScript.created.length).eq(2);
      const [sourcePreset, clonePreset] = PresetTextureScript.created;

      // The clone's constructor preset was displaced by the empty slot — its owned count returns.
      expect(cloned.getComponent(PresetTextureScript).texture).eq(null);
      expect(clonePreset.refCount).eq(0);
      expect(sourcePreset.refCount).eq(0);

      rootEntity.destroy();
    });

    it("an unowned counted preset triggers the contract diagnostic and still releases", () => {
      UnownedPresetScript.created.length = 0;
      const errorSpy = vi.spyOn(Logger, "error");
      const rootEntity = scene.createRootEntity("root");
      const parent = rootEntity.createChild("parent");
      const script = parent.addComponent(UnownedPresetScript);
      script.tex = null;

      const cloned = parent.clone();
      expect(cloned.getComponent(UnownedPresetScript).tex).eq(null);
      const diagnostics = errorSpy.mock.calls.filter((c) => String(c[0]).includes("holds no owned reference"));
      expect(diagnostics.length).eq(1);
      // Pins the current semantics: the unconditional -1 drives the unowned preset negative.
      expect(UnownedPresetScript.created[1].refCount).eq(-1);

      errorSpy.mockRestore();
      rootEntity.destroy();
    });

    it("a replaced owned preset releases its count when displaced by a deep-cloned value", () => {
      PresetTextureScript.created.length = 0;
      const rootEntity = scene.createRootEntity("root");
      const parent = rootEntity.createChild("parent");
      const script = parent.addComponent(PresetTextureScript);
      (script.texture as any)._addReferCount(-1);
      // The source slot holds a container: the gate deep-clones it, displacing the clone's preset.
      (script as any).texture = [1, 2, 3];

      const cloned = parent.clone();
      const [, clonePreset] = PresetTextureScript.created;
      expect(cloned.getComponent(PresetTextureScript).texture as any).deep.eq([1, 2, 3]);
      expect(clonePreset.refCount).eq(0);

      rootEntity.destroy();
    });

    it("a user type registered Assignment without counting API shares safely", () => {
      const rootEntity = scene.createRootEntity("root");
      const parent = rootEntity.createChild("parent");
      const script = parent.addComponent(SharedConfigScript);
      script.config = new SharedConfig();

      const cloned = parent.clone();
      expect(cloned.getComponent(SharedConfigScript).config).eq(script.config);

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
