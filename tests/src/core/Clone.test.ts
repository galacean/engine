import {
  BoolUpdateFlag,
  Burst,
  DataObject,
  DisorderedArray,
  Entity,
  ICloneHook,
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
import { Color, Ray, Vector3 } from "@galacean/engine-math";
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

/** Data object counting how often the gate runs its post-clone hook */
class HookCountPayload extends DataObject implements ICloneHook<HookCountPayload> {
  static runs = 0;
  value = 0;
  _onClone(): void {
    HookCountPayload.runs++;
  }
}

/** Script referencing one payload from two slots */
class SharedPayloadScript extends Script {
  slotA: HookCountPayload = null;
  slotB: HookCountPayload = null;
}

/** Script opting a plain runtime container into a deep copy */
class DeepContainerScript extends Script {
  @deepClone
  entries: DisorderedArray<{ id: number }> = new DisorderedArray<{ id: number }>();
}

/** Script asking for a deep copy the paired flag registry cannot honor */
class DeepFlagManagerScript extends Script {
  @deepClone
  flagManager: any = null;
}

/** Script whose constructor establishes its own bound handler */
class BoundHandlerScript extends Script {
  tickCount = 0;
  boundTick = this._tick.bind(this);

  private _tick(): void {
    this.tickCount++;
  }
}

/** Base script decorating two Entity fields, one to be overridden by a subclass, one left inherited. */
class BaseOverrideScript extends Script {
  @assignmentClone
  reDecorated: Entity;
  @ignoreClone
  inherited: Entity = null;
}

/** Subclass re-decorates `reDecorated` (Assignment → Ignore) but never mentions `inherited`. */
class SubOverrideScript extends BaseOverrideScript {
  @ignoreClone
  reDecorated: Entity;
}

let fieldModesCollisionId = 0;

class FieldModesCollisionScript extends BaseOverrideScript {
  _fieldModes = "user-owned";
  @ignoreClone
  runtimeId = ++fieldModesCollisionId;
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

/** Script whose Map / Set / Array fields carry constructor-built entries (the clone's preset). */
class PresetContainerScript extends Script {
  map = new Map<string, number>([["preset", 1]]);
  set = new Set<string>(["preset"]);
  list: number[] = [1, 2, 3];
}

/** Script whose Array / Map / Set fields alias class-level shared defaults (preset === source). */
class SharedDefaultContainerScript extends Script {
  static DEFAULT_LIST = [1, 2, 3];
  static DEFAULT_MAP = new Map<string, number>([["a", 1]]);
  static DEFAULT_SET = new Set<string>(["a"]);
  list: number[] = SharedDefaultContainerScript.DEFAULT_LIST;
  map: Map<string, number> = SharedDefaultContainerScript.DEFAULT_MAP;
  set: Set<string> = SharedDefaultContainerScript.DEFAULT_SET;
}

/** Plain class with no deep-clone default (not DataObject / math / container). */
class PlainConfig {
  count = 0;
  nested = { x: 1 };
}

/** Copyable class whose object tag does not identify it as a field-cloneable object. */
class TaggedCopyValue {
  value = 0;

  get [Symbol.toStringTag](): string {
    return "TaggedCopyValue";
  }

  copyFrom(source: TaggedCopyValue): void {
    this.value = source.value;
  }
}

/** Script sharing one container through an @assignmentClone field */
class AssignedContainerScript extends Script {
  @assignmentClone
  shared: number[] = [];
}

/** Script pointing @deepClone at a function value */
class DeepFnScript extends Script {
  @deepClone
  onTick: () => void = () => {};
}

/** Script pointing @deepClone at a value whose state may not be field-cloneable */
class DeepPlatformObjectScript extends Script {
  @deepClone
  value: object = null;
}

/** Script whose @deepClone fields hold members with no deep default of their own */
class DeepSubtreeScript extends Script {
  @deepClone
  configs: PlainConfig[] = [];
  @deepClone
  bag: any = null;
  @deepClone
  mixed: any[] = null;
}

/** Script whose ctor-built binary values stay observable through @ignoreClone aliases */
class BinaryPresetScript extends Script {
  weights = new Float32Array(3);
  view = new DataView(new ArrayBuffer(4));
  shortWeights = new Float32Array(2);
  @ignoreClone
  ownWeights = this.weights;
  @ignoreClone
  ownView = this.view;
  @ignoreClone
  ownShort = this.shortWeights;
}

/** Non-component class carrying its own @ignoreClone, to be reached through a field walk. */
class Bag {
  kept = 1;
  @ignoreClone
  runtime = 1;
}

/** Script forcing the walk into Bag with @deepClone. */
class BagHolderScript extends Script {
  @deepClone
  bag: Bag = null;
}

/** Script @deepClone-ing a class that has no deep-clone default — must force a deep copy. */
class ForcedDeepScript extends Script {
  @deepClone
  config: PlainConfig = null;
}

/** Two fields on one script pointing at the same default-less instance, one @deepClone'd. */
class MixedIntentScript extends Script {
  @deepClone
  deep: PlainConfig = null;
  shared: PlainConfig = null;
}

/** Same pair, declared the other way round — field order must not change either outcome. */
class MixedIntentReversedScript extends Script {
  shared: PlainConfig = null;
  @deepClone
  deep: PlainConfig = null;
}

/** Script holding the same class without @deepClone — the default path shares it. */
class SharedPlainScript extends Script {
  config: PlainConfig = null;
}

/** Script misusing @deepClone on an Entity ref — cloning it must throw. */
class DeepEntityRefScript extends Script {
  @deepClone
  target: Entity;
}

/** Script misusing @deepClone on an engine-bound asset — cloning it must throw. */
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

/** Script with an @ignoreClone function field preset by the constructor */
class IgnoredHandlerScript extends Script {
  @ignoreClone
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
    it("a shared object clones once, hook included", () => {
      const rootEntity = scene.createRootEntity("root");
      const parent = rootEntity.createChild("parent");
      const script = parent.addComponent(SharedPayloadScript);
      const shared = new HookCountPayload();
      shared.value = 42;
      script.slotA = shared;
      script.slotB = shared;

      HookCountPayload.runs = 0;
      const cloned = parent.clone();
      const cs = cloned.getComponent(SharedPayloadScript);

      expect(cs.slotA).not.eq(shared);
      expect(cs.slotA).eq(cs.slotB);
      expect(cs.slotA.value).eq(42);
      // A second slot resolving to the same clone must not re-run the post-clone hook: hooks
      // acquire references and register listeners, so a replay silently doubles both.
      expect(HookCountPayload.runs).eq(1);

      rootEntity.destroy();
    });

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

    it("@deepClone on an Entity ref throws — the explicit intent can't be honored, so it's surfaced", () => {
      const rootEntity = scene.createRootEntity("root");
      const parent = rootEntity.createChild("parent");
      const child = parent.createChild("child");
      const script = parent.addComponent(DeepEntityRefScript);
      script.target = child;

      // A decorator is the developer's explicit intent; @deepClone on an engine-bound Entity is a
      // mistake — thrown, never silently remapped (an undecorated Entity ref remaps by default).
      expect(() => parent.clone()).toThrowError(/@deepClone cannot deep clone/);

      rootEntity.destroy();
    });

    it("@deepClone on an asset ref throws — assets are engine-bound and shared by reference", () => {
      const rootEntity = scene.createRootEntity("root");
      const parent = rootEntity.createChild("parent");
      const script = parent.addComponent(DeepAssetRefScript);
      const texture = new Texture2D(engine, 4, 4);
      script.texture = texture;

      expect(() => parent.clone()).toThrowError(/@deepClone cannot deep clone/);

      rootEntity.destroy();
      texture.destroy(true);
    });

    it("@deepClone forces a deep copy of a class that has no deep-clone default", () => {
      const rootEntity = scene.createRootEntity("root");
      const parent = rootEntity.createChild("parent");
      const script = parent.addComponent(ForcedDeepScript);
      script.config = new PlainConfig();
      script.config.count = 7;
      script.config.nested.x = 42;

      const cloned = parent.clone();
      const cs = cloned.getComponent(ForcedDeepScript);

      // @deepClone is an explicit request: the value is field-walked into an independent copy,
      // even though PlainConfig is not DataObject / math / container (the default would share it).
      expect(cs.config).not.eq(script.config);
      expect(cs.config).instanceOf(PlainConfig);
      expect(cs.config.count).eq(7);
      expect(cs.config.nested).not.eq(script.config.nested);
      expect(cs.config.nested.x).eq(42);

      rootEntity.destroy();
    });

    it("the same class without @deepClone is shared by the default path", () => {
      const rootEntity = scene.createRootEntity("root");
      const parent = rootEntity.createChild("parent");
      const script = parent.addComponent(SharedPlainScript);
      script.config = new PlainConfig();

      const cloned = parent.clone();
      const cs = cloned.getComponent(SharedPlainScript);

      // No deep-clone default and no decorator — the clone shares the source instance.
      expect(cs.config).eq(script.config);

      rootEntity.destroy();
    });

    it("each field keeps its own intent when both point at one instance (@deepClone declared first)", () => {
      const rootEntity = scene.createRootEntity("root");
      const parent = rootEntity.createChild("parent");
      const script = parent.addComponent(MixedIntentScript);
      const config = new PlainConfig();
      script.deep = config;
      script.shared = config;

      const cloned = parent.clone();
      const cs = cloned.getComponent(MixedIntentScript);

      // The two fields ask for opposite things about the same instance, so each is honored on its
      // own: the decorated one gets an independent copy, the undecorated one keeps sharing.
      expect(cs.deep).not.eq(config);
      expect(cs.shared).eq(config);

      rootEntity.destroy();
    });

    it("each field keeps its own intent when both point at one instance (@deepClone declared last)", () => {
      const rootEntity = scene.createRootEntity("root");
      const parent = rootEntity.createChild("parent");
      const script = parent.addComponent(MixedIntentReversedScript);
      const config = new PlainConfig();
      script.deep = config;
      script.shared = config;

      const cloned = parent.clone();
      const cs = cloned.getComponent(MixedIntentReversedScript);

      // Same expectations as above: declaration order must not change the outcome.
      expect(cs.deep).not.eq(config);
      expect(cs.shared).eq(config);

      rootEntity.destroy();
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

    it("@ignoreClone function field keeps the clone's own constructor-built value (never the source)", () => {
      const rootEntity = scene.createRootEntity("root");
      const parent = rootEntity.createChild("parent");
      const script = parent.addComponent(IgnoredHandlerScript);
      const custom = () => {};
      script.handler = custom;

      const cloned = parent.clone();
      const cs = cloned.getComponent(IgnoredHandlerScript);

      // Ignore means the field is untouched by the gate — the clone's constructor already bound
      // its own handler to its own `this`, so it must be neither the overridden source value nor
      // the source instance's original bound handler.
      expect(cs.handler).not.eq(custom);
      expect(cs.handler).not.eq(script.handler);
      expect(typeof cs.handler).eq("function");

      rootEntity.destroy();
    });
  });

  describe("Subclass field re-decoration shadows the base class's", () => {
    it("the subclass's own decorator wins on a re-decorated field; an untouched field still inherits the base's", () => {
      const rootEntity = scene.createRootEntity("root");
      const parent = rootEntity.createChild("parent");
      const sibling = parent.createChild("sibling");
      const script = parent.addComponent(SubOverrideScript);
      script.reDecorated = sibling;
      script.inherited = sibling;

      const cloned = parent.clone();
      const cs = cloned.getComponent(SubOverrideScript);

      // Base decorates `reDecorated` @assignmentClone (share); the subclass re-decorates it
      // @ignoreClone — the subclass's own decoration must win, not the base's.
      expect(cs.reDecorated).eq(undefined);
      // `inherited` is never touched by the subclass — the base's @ignoreClone must still apply.
      expect(cs.inherited).eq(null);

      rootEntity.destroy();
    });

    it("does not leak the subclass's re-decoration back onto the base class", () => {
      // A subclass re-decorating a field must leave the base class untouched.
      const rootEntity = scene.createRootEntity("root");
      const parent = rootEntity.createChild("parent");
      const sibling = parent.createChild("sibling");
      const baseScript = parent.addComponent(BaseOverrideScript);
      baseScript.reDecorated = sibling;

      const cloned = parent.clone();
      const cs = cloned.getComponent(BaseOverrideScript);

      // The base class's own @assignmentClone on `reDecorated` must still share the source.
      expect(cs.reDecorated).eq(sibling);

      rootEntity.destroy();
    });

    it("does not let a user-owned _fieldModes field shadow clone metadata", () => {
      const rootEntity = scene.createRootEntity("root");
      const parent = rootEntity.createChild("parent");
      const sibling = parent.createChild("sibling");
      const script = parent.addComponent(FieldModesCollisionScript);
      script.reDecorated = sibling;
      script.inherited = sibling;

      const cloned = parent.clone();
      const cs = cloned.getComponent(FieldModesCollisionScript);

      expect(cs._fieldModes).eq("user-owned");
      expect(cs.runtimeId).not.eq(script.runtimeId);
      expect(cs.reDecorated).eq(sibling);
      expect(cs.inherited).eq(null);

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
    it("@deepClone on a function throws", () => {
      const rootEntity = scene.createRootEntity("root");
      const parent = rootEntity.createChild("parent");
      parent.addComponent(DeepFnScript);

      expect(() => parent.clone()).toThrowError(/@deepClone cannot deep clone a function/);

      rootEntity.destroy();
    });

    it("a function inside a @deepClone subtree is shared, not thrown on", () => {
      const rootEntity = scene.createRootEntity("root");
      const parent = rootEntity.createChild("parent");
      const script = parent.addComponent(DeepSubtreeScript);
      const fn = () => {};
      script.bag = { onDone: fn };

      const cloned = parent.clone();
      const cs = cloned.getComponent(DeepSubtreeScript);

      expect(cs.bag.onDone).eq(fn);

      rootEntity.destroy();
    });

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

    it("undecorated SafeLoopArray and UpdateFlag slots keep the clone's own value", () => {
      const rootEntity = scene.createRootEntity("root");
      const parent = rootEntity.createChild("parent");
      const script = parent.addComponent(HandlerScript);
      const loopList = (<any>new Signal())._listeners;
      loopList.push({ once: false });
      (script as any).loopList = loopList;
      (script as any).flag = new BoolUpdateFlag();

      const cloned = parent.clone();
      const cs = cloned.getComponent(HandlerScript) as any;

      expect(cs.loopList).eq(undefined);
      expect(cs.flag).eq(undefined);
      expect(loopList.length).eq(1);

      rootEntity.destroy();
    });

    it("@deepClone overrides the default on a plain container", () => {
      const rootEntity = scene.createRootEntity("root");
      const parent = rootEntity.createChild("parent");
      const script = parent.addComponent(DeepContainerScript);
      script.entries.add({ id: 1 });

      const cloned = parent.clone();
      const cs = cloned.getComponent(DeepContainerScript);

      expect(cs.entries).instanceOf(DisorderedArray);
      expect(cs.entries).not.eq(script.entries);
      expect(cs.entries.length).eq(1);
      expect(cs.entries._elements[0]).not.eq(script.entries._elements[0]);
      expect(cs.entries._elements[0].id).eq(1);

      rootEntity.destroy();
    });

    it("@deepClone on a paired flag registry throws", () => {
      const rootEntity = scene.createRootEntity("root");
      const parent = rootEntity.createChild("parent");
      const script = parent.addComponent(DeepFlagManagerScript);
      script.flagManager = (parent as any)._updateFlagManager;

      expect(() => parent.clone()).toThrowError(/@deepClone cannot deep clone "UpdateFlagManager"/);

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

  describe("Field-walk decorator awareness", () => {
    it("respects @ignoreClone on a walked non-component class", () => {
      const rootEntity = scene.createRootEntity("root");
      const parent = rootEntity.createChild("parent");
      const script = parent.addComponent(BagHolderScript);
      script.bag = new Bag();
      script.bag.kept = 42;
      script.bag.runtime = 42;

      const cloned = parent.clone();
      const cs = cloned.getComponent(BagHolderScript);

      // @deepClone forces the field walk into Bag, which must still honor Bag's own @ignoreClone:
      // `kept` is copied, `runtime` keeps the fresh instance's constructor value.
      expect(cs.bag).not.eq(script.bag);
      expect(cs.bag.kept).eq(42);
      expect(cs.bag.runtime).eq(1);

      rootEntity.destroy();
    });
  });

  describe("Container member semantics", () => {
    it("@assignmentClone on a container shares the instance with the source", () => {
      const rootEntity = scene.createRootEntity("root");
      const parent = rootEntity.createChild("parent");
      const script = parent.addComponent(AssignedContainerScript);
      script.shared.push(1, 2);

      const cloned = parent.clone();
      const cs = cloned.getComponent(AssignedContainerScript);

      expect(cs.shared).eq(script.shared);
      cs.shared.push(3);
      expect(script.shared.length).eq(3);

      rootEntity.destroy();
    });

    it("Map keys are cloned along with values", () => {
      const rootEntity = scene.createRootEntity("root");
      const parent = rootEntity.createChild("parent");
      const script = parent.addComponent(HandlerScript);
      const key = { id: 7 };
      (script as any).byObject = new Map([[key, 1]]);

      const cloned = parent.clone();
      const cs = cloned.getComponent(HandlerScript) as any;

      // The clone's key is a fresh object: lookups by the source key miss by design.
      expect(cs.byObject.size).eq(1);
      expect(cs.byObject.has(key)).eq(false);
      const clonedKey = [...cs.byObject.keys()][0];
      expect(clonedKey).not.eq(key);
      expect(clonedKey.id).eq(7);
      expect(cs.byObject.get(clonedKey)).eq(1);

      rootEntity.destroy();
    });

    it("entity Map keys remap to the cloned subtree", () => {
      const rootEntity = scene.createRootEntity("root");
      const parent = rootEntity.createChild("parent");
      const child = parent.createChild("child");
      const script = parent.addComponent(HandlerScript);
      (script as any).byEntity = new Map([[child, 5]]);

      const cloned = parent.clone();
      const cs = cloned.getComponent(HandlerScript) as any;

      expect(cs.byEntity.get(cloned.children[0])).eq(5);
      expect(cs.byEntity.has(child)).eq(false);

      rootEntity.destroy();
    });

    it("a function held as a Map value is shared", () => {
      const rootEntity = scene.createRootEntity("root");
      const parent = rootEntity.createChild("parent");
      const script = parent.addComponent(HandlerScript);
      const fn = () => 1;
      (script as any).handlerMap = new Map([["k", fn]]);

      const cloned = parent.clone();
      const cs = cloned.getComponent(HandlerScript) as any;

      expect(cs.handlerMap.get("k")).eq(fn);

      rootEntity.destroy();
    });
  });

  describe("@deepClone subtree propagation", () => {
    it("plain-class members of a @deepClone container are copied, not shared", () => {
      const rootEntity = scene.createRootEntity("root");
      const parent = rootEntity.createChild("parent");
      const script = parent.addComponent(DeepSubtreeScript);
      const config = new PlainConfig();
      config.count = 5;
      script.configs.push(config);

      const cloned = parent.clone();
      const cs = cloned.getComponent(DeepSubtreeScript);

      expect(cs.configs[0]).not.eq(config);
      expect(cs.configs[0].count).eq(5);
      expect(cs.configs[0].nested).not.eq(config.nested);
      cs.configs[0].count = 1;
      expect(config.count).eq(5);

      rootEntity.destroy();
    });

    it("the force carries through nested plain objects", () => {
      const rootEntity = scene.createRootEntity("root");
      const parent = rootEntity.createChild("parent");
      const script = parent.addComponent(DeepSubtreeScript);
      const config = new PlainConfig();
      script.bag = { cfg: config };

      const cloned = parent.clone();
      const cs = cloned.getComponent(DeepSubtreeScript);

      expect(cs.bag.cfg).not.eq(config);
      expect(cs.bag.cfg.nested).not.eq(config.nested);

      rootEntity.destroy();
    });

    it("engine-bound members inside a @deepClone subtree keep their defaults", () => {
      const rootEntity = scene.createRootEntity("root");
      const parent = rootEntity.createChild("parent");
      const child = parent.createChild("child");
      const script = parent.addComponent(DeepSubtreeScript);
      const texture = new Texture2D(engine, 1, 1);
      script.mixed = [child, texture];

      const cloned = parent.clone();
      const cs = cloned.getComponent(DeepSubtreeScript);

      expect(cs.mixed[0]).eq(cloned.children[0]);
      expect(cs.mixed[1]).eq(texture);

      rootEntity.destroy();
    });

    it("platform objects with internal state keep their default assignment inside a deep subtree", () => {
      const rootEntity = scene.createRootEntity("root");
      const parent = rootEntity.createChild("parent");
      const script = parent.addComponent(DeepSubtreeScript);
      const date = new Date(1234);
      script.bag = { date };

      const cloned = parent.clone();
      const cs = cloned.getComponent(DeepSubtreeScript);

      expect(cs.bag).not.eq(script.bag);
      expect(cs.bag.date).eq(date);
      expect(cs.bag.date.getTime()).eq(1234);

      rootEntity.destroy();
    });
  });

  describe("@deepClone capability boundary", () => {
    it.each([
      ["Date", () => new Date(1234)],
      ["RegExp", () => /clone/gi]
    ])("rejects %s because its state cannot be reproduced by a field walk", (typeName, createValue) => {
      const rootEntity = scene.createRootEntity("root");
      const parent = rootEntity.createChild("parent");
      const script = parent.addComponent(DeepPlatformObjectScript);
      script.value = createValue();

      expect(() => parent.clone()).toThrowError(
        new RegExp(`@deepClone cannot deep clone "${typeName}".*internal state`)
      );

      rootEntity.destroy();
    });

    it("accepts a copyFrom type without maintaining a matching type whitelist", () => {
      const rootEntity = scene.createRootEntity("root");
      const parent = rootEntity.createChild("parent");
      const script = parent.addComponent(DeepPlatformObjectScript);
      const value = new TaggedCopyValue();
      value.value = 42;
      script.value = value;

      const cloned = parent.clone();
      const clonedValue = cloned.getComponent(DeepPlatformObjectScript).value as TaggedCopyValue;

      expect(clonedValue).instanceOf(TaggedCopyValue);
      expect(clonedValue).not.eq(value);
      expect(clonedValue.value).eq(42);

      rootEntity.destroy();
    });
  });

  describe("copyFrom value types via entity.clone", () => {
    it("all exported math copyFrom types deep-clone through their registered type default", () => {
      const typeNames = [
        "BoundingBox",
        "BoundingFrustum",
        "BoundingSphere",
        "Color",
        "Matrix",
        "Matrix3x3",
        "Plane",
        "Quaternion",
        "Ray",
        "Rect",
        "SphericalHarmonics3",
        "Vector2",
        "Vector3",
        "Vector4"
      ] as const;
      const types = typeNames.map((name) => EngineMath[name] as new () => any);
      const spies = types.map((Type) => vi.spyOn(Type.prototype, "copyFrom"));
      const values = types.map((Type) => new Type());
      spies.forEach((spy) => spy.mockClear());

      const rootEntity = scene.createRootEntity("root");
      try {
        const parent = rootEntity.createChild("parent");
        const script = parent.addComponent(HandlerScript) as any;
        script.mathValues = values;

        const clonedValues = (parent.clone().getComponent(HandlerScript) as any).mathValues;
        for (let i = 0; i < values.length; i++) {
          expect(clonedValues[i]).instanceOf(types[i]);
          expect(clonedValues[i]).not.eq(values[i]);
          expect(spies[i]).toHaveBeenCalledWith(values[i]);
        }
      } finally {
        spies.forEach((spy) => spy.mockRestore());
        rootEntity.destroy();
      }
    });

    it("a Ray field deep-clones through the gate", () => {
      const rootEntity = scene.createRootEntity("root");
      const parent = rootEntity.createChild("parent");
      const script = parent.addComponent(HandlerScript);
      (script as any).ray = new Ray(new Vector3(1, 2, 3), new Vector3(0, 1, 0));

      const cloned = parent.clone();
      const cs = cloned.getComponent(HandlerScript) as any;

      expect(cs.ray).instanceOf(Ray);
      expect(cs.ray).not.eq((script as any).ray);
      expect(cs.ray.origin.x).eq(1);
      cs.ray.origin.x = 9;
      expect((script as any).ray.origin.x).eq(1);

      rootEntity.destroy();
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

    it("a self-referencing plain object clones into a self-referencing clone", () => {
      const rootEntity = scene.createRootEntity("root");
      const parent = rootEntity.createChild("parent");
      const script = parent.addComponent(HandlerScript);
      const node: any = { value: 1 };
      node.self = node;
      const ring: any[] = [node];
      ring.push(ring);
      (script as any).node = node;
      (script as any).ring = ring;

      const cloned = parent.clone();
      const cs = cloned.getComponent(HandlerScript) as any;

      expect(cs.node).not.eq(node);
      expect(cs.node.self).eq(cs.node);
      expect(cs.ring).not.eq(ring);
      expect(cs.ring[1]).eq(cs.ring);
      expect(cs.ring[0]).eq(cs.node);

      rootEntity.destroy();
    });
  });

  describe("Binary data fields", () => {
    it("matching binary presets are written into, not replaced", () => {
      const rootEntity = scene.createRootEntity("root");
      const parent = rootEntity.createChild("parent");
      const script = parent.addComponent(BinaryPresetScript);
      script.weights = new Float32Array([9, 8, 7]);
      const view = new DataView(new ArrayBuffer(4));
      view.setUint8(0, 42);
      script.view = view;

      const cloned = parent.clone();
      const cs = cloned.getComponent(BinaryPresetScript);

      // Same length / byteLength: the clone's ctor-built instance is reused as the target.
      expect(cs.weights).eq(cs.ownWeights);
      expect(Array.from(cs.weights)).deep.eq([9, 8, 7]);
      expect(cs.view).eq(cs.ownView);
      expect(cs.view.getUint8(0)).eq(42);

      rootEntity.destroy();
    });

    it("a length-mismatched binary preset is replaced by a fresh copy", () => {
      const rootEntity = scene.createRootEntity("root");
      const parent = rootEntity.createChild("parent");
      const script = parent.addComponent(BinaryPresetScript);
      script.shortWeights = new Float32Array([1, 2, 3]);

      const cloned = parent.clone();
      const cs = cloned.getComponent(BinaryPresetScript);

      expect(cs.shortWeights).not.eq(cs.ownShort);
      expect(Array.from(cs.shortWeights)).deep.eq([1, 2, 3]);

      rootEntity.destroy();
    });

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

    it("array / map / set presets aliasing the source value are never written into", () => {
      const rootEntity = scene.createRootEntity("root");
      const parent = rootEntity.createChild("parent");
      parent.addComponent(SharedDefaultContainerScript);

      const cloned = parent.clone();
      const cs = cloned.getComponent(SharedDefaultContainerScript);

      // The clone's preset IS the source value (a class-level shared default), so it can't be
      // filled in place — that would write through into the source.
      expect(cs.list).not.eq(SharedDefaultContainerScript.DEFAULT_LIST);
      expect(cs.map).not.eq(SharedDefaultContainerScript.DEFAULT_MAP);
      expect(cs.set).not.eq(SharedDefaultContainerScript.DEFAULT_SET);
      expect(cs.list).deep.eq([1, 2, 3]);
      expect(SharedDefaultContainerScript.DEFAULT_LIST).deep.eq([1, 2, 3]);
      expect(SharedDefaultContainerScript.DEFAULT_MAP.size).eq(1);
      expect(SharedDefaultContainerScript.DEFAULT_SET.size).eq(1);

      rootEntity.destroy();
    });

    it("a reused map / set preset drops its own constructor-built entries", () => {
      const rootEntity = scene.createRootEntity("root");
      const parent = rootEntity.createChild("parent");
      const script = parent.addComponent(PresetContainerScript);
      // Source diverges from what the clone's constructor will build.
      script.map = new Map([["source", 9]]);
      script.set = new Set(["source"]);
      script.list = [7, 8, 9];

      const cloned = parent.clone();
      const cs = cloned.getComponent(PresetContainerScript);

      // The clone's own preset entries ("preset") must not survive next to the source's.
      expect([...cs.map.keys()]).deep.eq(["source"]);
      expect([...cs.set]).deep.eq(["source"]);
      expect(cs.list).deep.eq([7, 8, 9]);
      // ...and the source is untouched.
      expect([...script.map.keys()]).deep.eq(["source"]);

      rootEntity.destroy();
    });
  });

  describe("Plain data classification", () => {
    it("ignores an own constructor field when identifying plain objects", () => {
      const rootEntity = scene.createRootEntity("root");
      const parent = rootEntity.createChild("parent");
      const script = parent.addComponent(CopyFromDataScript);
      const namedConstructor = { constructor: "payload", nested: { value: 1 } };
      const undefinedConstructor = { constructor: undefined, nested: { value: 2 } };
      script.config = [namedConstructor, undefinedConstructor];

      const cloned = parent.clone();
      const configs = cloned.getComponent(CopyFromDataScript).config;

      expect(configs[0]).not.eq(namedConstructor);
      expect(configs[0].constructor).eq("payload");
      expect(configs[0].nested).not.eq(namedConstructor.nested);
      expect(configs[1]).not.eq(undefinedConstructor);
      expect(Object.getPrototypeOf(configs[1])).eq(Object.prototype);
      expect(configs[1].constructor).eq(undefined);
      expect(configs[1].nested).not.eq(undefinedConstructor.nested);

      rootEntity.destroy();
    });

    it("recognizes a cross-realm plain object", () => {
      const iframe = document.createElement("iframe");
      document.body.appendChild(iframe);
      const rootEntity = scene.createRootEntity("root");
      try {
        const foreignWindow = <any>iframe.contentWindow;
        const foreignObject = new foreignWindow.Object();
        const foreignNested = new foreignWindow.Object();
        foreignNested.value = 1;
        foreignObject.nested = foreignNested;

        const parent = rootEntity.createChild("parent");
        const script = parent.addComponent(CopyFromDataScript);
        script.config = foreignObject;

        const cloned = parent.clone();
        const config = cloned.getComponent(CopyFromDataScript).config;

        expect(config).not.eq(foreignObject);
        expect(config.nested).not.eq(foreignNested);
        expect(config.nested.value).eq(1);
      } finally {
        rootEntity.destroy();
        iframe.remove();
      }
    });

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
          // math value types dispatch by their callable copyFrom; core/ui Deep types are the
          // DataObject family
          const isDeep =
            pkg === "math"
              ? typeof exported.prototype.copyFrom === "function"
              : exported.prototype instanceof DataObject;
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
