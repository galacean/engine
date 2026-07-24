import { Quaternion } from "@galacean/engine";
import { DynamicCollider, Entity, EntityModifyFlags, Scene, Script } from "@galacean/engine-core";
import { PhysXPhysics } from "@galacean/engine-physics-physx";
import { WebGLEngine } from "@galacean/engine";
import { beforeEach, describe, expect, it, vi } from "vitest";

class TestComponent extends Script {}

describe("Entity", async () => {
  const engine = await WebGLEngine.create({ canvas: document.createElement("canvas"), physics: new PhysXPhysics() });
  const scene = engine.sceneManager.activeScene;
  engine.run();
  beforeEach(() => {
    scene.createRootEntity("root");
  });

  describe("scene.findByPath", () => {
    it("normal", () => {
      const parentX = new Entity(engine, "parent");
      const parent = new Entity(engine, "parent");
      const parentY = new Entity(engine, "parent");

      const root = scene.getRootEntity();
      parentX.parent = root;
      parent.parent = root;
      parentY.parent = root;

      const child = new Entity(engine, "child");
      child.parent = parentX;
      const child1 = new Entity(engine, "child1");
      child1.parent = parent;
      const child2 = new Entity(engine, "child2");
      child2.parent = parentY;

      expect(scene.findEntityByPath("")).eq(null);

      expect(scene.findEntityByPath("root")).eq(root);

      expect(scene.findEntityByPath("root/parent")).eq(parentX);

      expect(scene.findEntityByPath("root/parent/null")).eq(null);

      expect(scene.findEntityByPath("root/parent/child1")).eq(child1);
      expect(scene.findEntityByPath("root/parent/child")).eq(child);
      expect(scene.findEntityByPath("root/parent/child2")).eq(child2);
    });
    it("not found", () => {
      const parent = new Entity(engine, "parent");
      parent.parent = scene.getRootEntity();

      const child = new Entity(engine, "child");
      child.parent = parent;

      expect(scene.findEntityByPath("child")).eq(null);

      expect(scene.findEntityByPath("parent/test")).eq(null);
    });
  });

  describe("isActive", () => {
    it("normal", () => {
      const parent = new Entity(engine, "parent");

      parent.parent = scene.getRootEntity();
      const child = new Entity(engine, "child");
      child.parent = parent;
      parent.isActive = false;
      child.isActive = true;
      expect(parent.isActive).eq(false);
      expect(child.isActive).eq(true);
    });
  });

  describe("isActiveInHierarchy", () => {
    it("normal", () => {
      const parent = new Entity(engine, "parent");

      parent.parent = scene.getRootEntity();
      const child = new Entity(engine, "child");
      child.parent = parent;
      parent.isActive = true;
      child.isActive = true;
      expect(parent.isActiveInHierarchy).eq(true);
      expect(child.isActiveInHierarchy).eq(true);
    });

    it("child false", () => {
      const parent = new Entity(engine, "parent");

      parent.parent = scene.getRootEntity();
      const child = new Entity(engine, "child");
      child.parent = parent;
      parent.isActive = true;
      child.isActive = false;
      expect(parent.isActiveInHierarchy).eq(true);
      expect(child.isActiveInHierarchy).eq(false);
    });

    it("parent false", () => {
      const parent = new Entity(engine, "parent");

      parent.parent = scene.getRootEntity();
      const child = new Entity(engine, "child");
      child.parent = parent;
      parent.isActive = false;
      child.isActive = true;
      expect(parent.isActiveInHierarchy).eq(false);
      expect(child.isActiveInHierarchy).eq(false);
    });
  });

  describe("parent", () => {
    it("normal", () => {
      const parent = new Entity(engine, "parent");

      parent.parent = scene.getRootEntity();
      const child = new Entity(engine, "child");
      child.parent = parent;
      child.parent = parent;
      expect(child.parent).eq(parent);
    });

    it("null", () => {
      const parent = new Entity(engine, "parent");

      parent.parent = scene.getRootEntity();
      const child = new Entity(engine, "child");
      child.parent = parent;
      child.parent = null;
      expect(child.parent).eq(null);
    });

    it("change", () => {
      const parent = new Entity(engine, "parent");

      parent.parent = scene.getRootEntity();
      const parent2 = new Entity(engine, "parent");

      parent2.parent = scene.getRootEntity();
      const child = new Entity(engine, "child");
      child.parent = parent;
      child.parent = parent2;
      expect(child.parent).eq(parent2);
    });
  });

  describe("childCount", () => {
    it("normal", () => {
      const parent = new Entity(engine, "parent");

      parent.parent = scene.getRootEntity();
      const child = new Entity(engine, "child");
      child.parent = parent;
      expect(parent.children.length).eq(1);
    });

    it("null", () => {
      const parent = new Entity(engine, "parent");

      parent.parent = scene.getRootEntity();
      const child = new Entity(engine, "child");
      child.parent = parent;
      child.parent = null;
      expect(parent.children.length).eq(0);
    });

    it("change", () => {
      const parent = new Entity(engine, "parent");

      parent.parent = scene.getRootEntity();
      const parent2 = new Entity(engine, "parent");

      parent2.parent = scene.getRootEntity();
      const child = new Entity(engine, "child");
      child.parent = parent;
      child.parent = parent2;
      expect(parent2.children.length).eq(1);
      expect(parent.children.length).eq(0);
    });
  });

  describe("scene", () => {
    it("normal", () => {
      const parent = new Entity(engine, "parent");

      parent.parent = scene.getRootEntity();
      const child = new Entity(engine, "child");
      child.parent = parent;
      expect(parent.scene).eq(scene);
      expect(child.scene).eq(scene);
    });

    it("change parent", () => {
      const parent = new Entity(engine, "parent");

      parent.parent = scene.getRootEntity();
      const child = new Entity(engine, "child");
      child.parent = parent;
      expect(parent.scene).eq(scene);
      expect(child.scene).eq(scene);
    });
  });

  describe("scene", () => {
    it("normal", () => {
      const parent = new Entity(engine, "parent");

      parent.parent = scene.getRootEntity();
      const child = new Entity(engine, "child");
      child.parent = parent;
      expect(child.scene).eq(scene);
    });

    it("change parent", () => {
      const parent = new Entity(engine, "parent");

      parent.parent = scene.getRootEntity();
      const child = new Entity(engine, "child");
      child.parent = parent;
      expect(parent.scene).eq(scene);
      expect(child.scene).eq(scene);
    });
  });

  describe("component", () => {
    it("addComponent getComponent", () => {
      const entity = new Entity(engine, "entity");

      entity.parent = scene.getRootEntity();
      const component = entity.addComponent(TestComponent);
      expect(entity.getComponent(TestComponent)).eq(component);
    });

    it("addComponent getComponents", () => {
      const entity = new Entity(engine, "entity");

      entity.parent = scene.getRootEntity();
      const component = entity.addComponent(TestComponent);
      const res = [];
      entity.getComponents(TestComponent, res);
      expect(res[0]).eq(component);
    });
  });

  describe("child", () => {
    it("addChild", () => {
      const parent = new Entity(engine, "parent");

      parent.parent = scene.getRootEntity();
      const child = new Entity(engine, "child");
      child.parent = parent;
      parent.addChild(child);
      expect(child.parent).eq(parent);
      expect(child.scene).eq(scene);

      const childAno = new Entity(engine, "childAno");
      childAno.parent = parent;
      parent.addChild(0, childAno);
      expect(childAno.siblingIndex).eq(0);
    });

    it("removeChild", () => {
      const parent = new Entity(engine, "parent");

      parent.parent = scene.getRootEntity();
      const child = new Entity(engine, "child");
      child.parent = parent;
      parent.removeChild(child);
      expect(child.parent).eq(null);
      expect(child.scene).eq(null);
    });

    it("getChild", () => {
      const parent = new Entity(engine, "parent");

      parent.parent = scene.getRootEntity();
      const child = new Entity(engine, "child");
      child.parent = parent;
      const theChild = parent.getChild(0);
      expect(theChild).eq(child);
    });

    it("getChild", () => {
      const parent = new Entity(engine, "parent");
      parent.parent = scene.getRootEntity();
      const child = new Entity(engine, "child");
      child.parent = parent;
      const theChild = parent.getChild(0);
      expect(theChild).eq(child);
    });

    it("findByName", () => {
      const parent = new Entity(engine, "parent");
      parent.parent = scene.getRootEntity();
      const child = new Entity(engine, "child");
      child.parent = parent;
      const child2 = new Entity(engine, "child2");
      child2.parent = parent;
      expect(parent.findByName("parent")).eq(parent);
      expect(parent.findByName("child")).eq(child);
      expect(parent.findByName("child2")).eq(child2);
    });

    it("findByPath", () => {
      const parent = new Entity(engine, "parent");
      parent.parent = scene.getRootEntity();
      const child = new Entity(engine, "child");
      child.parent = parent;
      const child2 = new Entity(engine, "child");
      child2.parent = parent;
      const child3 = new Entity(engine, "child");
      child3.parent = parent;

      const grandson = new Entity(engine, "grandsonX");
      grandson.parent = child;
      const grandson2 = new Entity(engine, "grandson");
      grandson2.parent = child2;

      expect(parent.findByPath("/child")).eq(child);
      expect(parent.findByPath("child/grandson")).eq(grandson2);
    });

    it("clearChildren", () => {
      const parent = new Entity(engine, "parent");

      parent.parent = scene.getRootEntity();
      const child = new Entity(engine, "child");
      child.parent = parent;
      const child2 = new Entity(engine, "child2");
      child2.parent = parent;

      const parentModifyCount = [0, 0, 0];
      const childModifyCount = [0, 0, 0];
      const child2ModifyCount = [0, 0, 0];
      let childCountAtDispatch = -1;
      // @ts-ignore
      parent._registerModifyListener((flag: EntityModifyFlags) => {
        ++parentModifyCount[flag];
        flag === EntityModifyFlags.Child && (childCountAtDispatch = parent.children.length);
      });
      // @ts-ignore
      child._registerModifyListener((flag: EntityModifyFlags) => ++childModifyCount[flag]);
      // @ts-ignore
      child2._registerModifyListener((flag: EntityModifyFlags) => ++child2ModifyCount[flag]);

      parent.clearChildren();
      expect(parent.children.length).eq(0);

      // Parent should receive a single `Child` modify event for the whole clear so
      // listeners (e.g. UICanvas) can invalidate their cached state.
      expect(parentModifyCount[EntityModifyFlags.Child]).eq(1);
      // The event must fire before the children are detached, while listeners
      // registered from the removed subtrees are still able to receive it.
      expect(childCountAtDispatch).eq(2);
      // Each detached child should receive a `Parent` modify event.
      expect(childModifyCount[EntityModifyFlags.Parent]).eq(1);
      expect(child2ModifyCount[EntityModifyFlags.Parent]).eq(1);
      // Sibling index must be reset so the entity is treated as lonely afterwards.
      expect(child.siblingIndex).eq(-1);
      expect(child2.siblingIndex).eq(-1);

      // Clearing an entity that has no children should not dispatch any event.
      parent.clearChildren();
      expect(parentModifyCount[EntityModifyFlags.Child]).eq(1);
    });
    it("sibling index", () => {
      const root = scene.createRootEntity();
      const child0 = new Entity(engine, "child0");
      const child1 = new Entity(engine, "child1");
      const child2 = new Entity(engine, "child2");
      const child3 = new Entity(engine, "child3");

      // insert index
      root.addChild(child0);
      root.addChild(child2);
      root.addChild(child3);
      root.addChild(1, child1);

      expect(child0).eq(root.children[0]);
      expect(child1).eq(root.children[1]);
      expect(child2).eq(root.children[2]);
      expect(child3).eq(root.children[3]);
      expect(child0.siblingIndex).eq(0);
      expect(child1.siblingIndex).eq(1);
      expect(child2.siblingIndex).eq(2);
      expect(child3.siblingIndex).eq(3);

      // high index to low index
      child2.siblingIndex = 0;
      expect(child2).eq(root.children[0]);
      expect(child0).eq(root.children[1]);
      expect(child1).eq(root.children[2]);
      expect(child3).eq(root.children[3]);
      expect(child2.siblingIndex).eq(0);
      expect(child0.siblingIndex).eq(1);
      expect(child1.siblingIndex).eq(2);
      expect(child3.siblingIndex).eq(3);

      // low index to high index
      child2.siblingIndex = 3;
      expect(child0).eq(root.children[0]);
      expect(child1).eq(root.children[1]);
      expect(child3).eq(root.children[2]);
      expect(child2).eq(root.children[3]);
      expect(child0.siblingIndex).eq(0);
      expect(child1.siblingIndex).eq(1);
      expect(child3.siblingIndex).eq(2);
      expect(child2.siblingIndex).eq(3);

      // remove entity
      child1.parent = null;
      expect(child0).eq(root.children[0]);
      expect(child3).eq(root.children[1]);
      expect(child2).eq(root.children[2]);
      expect(child0.siblingIndex).eq(0);
      expect(child3.siblingIndex).eq(1);
      expect(child2.siblingIndex).eq(2);
      expect(child1.siblingIndex).eq(-1);

      // project large index
      child2.siblingIndex = 5;
      expect(child2.siblingIndex).eq(2);

      // thorw error whenless than 0 index
      var siblingIndexBadFn = function () {
        child2.siblingIndex = -1;
      };
      expect(siblingIndexBadFn).to.throw();

      // setting sibling index on a lonely entity (no parent, not in scene root) warns instead of throwing
      const entityX = new Entity(engine, "entityX");
      var lonelyFn = function () {
        entityX.siblingIndex = 1;
      };
      expect(lonelyFn).not.to.throw();
      expect(entityX.siblingIndex).eq(-1);
    });

    it("isRoot", () => {
      const parent = scene.createRootEntity("parent");
      const child = scene.createRootEntity("child");

      // addChild should remove child from rootEntities
      parent.addChild(child);
      // @ts-ignore
      expect(child._isRoot).eq(false);
      expect(scene.rootEntities).not.toContain(child);
      expect(child.parent).eq(parent);

      // addRootEntity should restore root status
      scene.addRootEntity(child);
      // @ts-ignore
      expect(child._isRoot).eq(true);
      expect(scene.rootEntities).toContain(child);

      // parent setter should remove child from rootEntities
      child.parent = parent;
      // @ts-ignore
      expect(child._isRoot).eq(false);
      expect(scene.rootEntities).not.toContain(child);
      expect(child.parent).eq(parent);

      // addRootEntity should restore root status again
      scene.addRootEntity(child);
      // @ts-ignore
      expect(child._isRoot).eq(true);
      expect(scene.rootEntities).toContain(child);
    });

    it("removeChild guard", () => {
      const parentA = scene.createRootEntity("parentA");
      const parentB = scene.createRootEntity("parentB");
      const child = new Entity(engine, "child");
      parentA.addChild(child);
      expect(child.parent).eq(parentA);

      // removeChild on wrong parent should be no-op
      parentB.removeChild(child);
      expect(child.parent).eq(parentA);
      expect(parentA.children).toContain(child);
    });

    it("InActiveAndActive", () => {
      const parentA = scene.createRootEntity("parentA");
      const parentB = new Entity(engine, "parentB");
      const parentC = scene.createRootEntity("parentC");
      const sceneA = new Scene(engine, "sceneA");
      const sceneB = new Scene(engine, "sceneB");
      const child = new Entity(engine, "child");

      let enableCount = 0;
      let disableCount = 0;
      let enableInSceneCount = 0;
      let disableInSceneCount = 0;

      child.addComponent(
        class extends Script {
          _onEnable(): void {
            ++enableCount;
          }

          _onDisable(): void {
            ++disableCount;
          }

          _onEnableInScene(): void {
            ++enableInSceneCount;
          }

          _onDisableInScene(): void {
            ++disableInSceneCount;
          }
        }
      );

      expect(child.isActive).eq(true);
      expect(child.isActiveInHierarchy).eq(false);
      child.isActive = false;
      expect(child.isActive).eq(false);

      parentB.addChild(child);
      expect(child.isActive).eq(false);
      expect(child.isActiveInHierarchy).eq(false);
      expect(enableCount).eq(0);
      expect(disableCount).eq(0);
      expect(enableInSceneCount).eq(0);
      expect(disableInSceneCount).eq(0);
      child.isActive = true;
      expect(child.isActive).eq(true);
      expect(child.isActiveInHierarchy).eq(false);
      expect(enableCount).eq(0);
      expect(disableCount).eq(0);
      expect(enableInSceneCount).eq(0);
      expect(disableInSceneCount).eq(0);

      parentA.addChild(child);
      expect(child.isActiveInHierarchy).eq(true);
      expect(enableCount).eq(1);
      expect(disableCount).eq(0);
      expect(enableInSceneCount).eq(1);
      expect(disableInSceneCount).eq(0);

      parentA.addChild(child);
      expect(child.isActiveInHierarchy).eq(true);
      expect(enableCount).eq(1);
      expect(disableCount).eq(0);
      expect(enableInSceneCount).eq(1);
      expect(disableInSceneCount).eq(0);

      parentC.addChild(child);
      expect(child.isActiveInHierarchy).eq(true);
      expect(enableCount).eq(1);
      expect(disableCount).eq(0);
      expect(enableInSceneCount).eq(1);
      expect(disableInSceneCount).eq(0);

      sceneA.addRootEntity(child);
      expect(child.isActiveInHierarchy).eq(false);
      expect(enableCount).eq(1);
      expect(disableCount).eq(1);
      expect(enableInSceneCount).eq(2);
      expect(disableInSceneCount).eq(1);

      engine.sceneManager.addScene(sceneB);
      sceneB.addRootEntity(child);
      expect(child.isActiveInHierarchy).eq(true);
      expect(enableCount).eq(2);
      expect(disableCount).eq(1);
      expect(enableInSceneCount).eq(3);
      expect(disableInSceneCount).eq(2);

      sceneB.removeRootEntity(child);
      expect(child.isActiveInHierarchy).eq(false);
      expect(enableCount).eq(2);
      expect(disableCount).eq(2);
      expect(enableInSceneCount).eq(3);
      expect(disableInSceneCount).eq(3);
    });
  });

  describe("clone", () => {
    it("normal", () => {
      const parent = new Entity(engine, "parent");

      parent.parent = scene.getRootEntity();
      const child = new Entity(engine, "child");
      child.parent = parent;
      const cloneParent = parent.clone();
      expect(cloneParent.children.length).eq(parent.children.length);
      expect(cloneParent.findByName("child").name).eq(child.name);
      expect(cloneParent.findByName("child")).eq(cloneParent.getChild(0));

      // Transform
      const entityParent = new Entity(engine, "parent");
      const entityChild = entityParent.createChild("child");
      const entityGrandson = entityChild.createChild("grandson");
      entityGrandson.transform.rotation.set(90, 0, 0);
      // DynamicCollider 组件在构造函数中会获取 worldRotationQuaternion
      entityGrandson.addComponent(DynamicCollider);
      const entityChildClone = entityParent.clone().children[0];
      const entityGrandsonClone = entityChildClone.children[0];
      // @ts-ignore
      expect(entityChildClone.transform.instanceId).eq(entityGrandsonClone.transform._getParentTransform()?.instanceId);
      expect(
        Quaternion.equals(new Quaternion(0.7071067, 0, 0, 0.7071067), entityGrandsonClone.transform.rotationQuaternion)
      ).eq(true);
    });
  });

  describe("modify", () => {
    it("ParentAndChild", () => {
      const parentA = scene.createRootEntity("parentA");
      const parentB = scene.createRootEntity("parentB");
      const child = new Entity(engine, "child");

      let modifyParentACount = [0, 0, 0];
      let modifyParentBCount = [0, 0, 0];
      let modifyChildCount = [0, 0, 0];

      const modifyParentA = (flag: EntityModifyFlags, child: Entity) => {
        ++modifyParentACount[flag];
      };
      const modifyParentB = (flag: EntityModifyFlags, child: Entity) => {
        ++modifyParentBCount[flag];
      };
      const modifyChild = (flag: EntityModifyFlags, child: Entity) => {
        ++modifyChildCount[flag];
      };
      // @ts-ignore
      parentA._registerModifyListener(modifyParentA);
      // @ts-ignore
      parentB._registerModifyListener(modifyParentB);
      // @ts-ignore
      child._registerModifyListener(modifyChild);

      expect(modifyParentACount[EntityModifyFlags.Child]).eq(0);
      expect(modifyParentACount[EntityModifyFlags.Parent]).eq(0);
      expect(modifyParentBCount[EntityModifyFlags.Child]).eq(0);
      expect(modifyParentBCount[EntityModifyFlags.Parent]).eq(0);
      expect(modifyChildCount[EntityModifyFlags.Child]).eq(0);
      expect(modifyChildCount[EntityModifyFlags.Parent]).eq(0);
      parentA.addChild(child);

      expect(modifyParentACount[EntityModifyFlags.Child]).eq(1);
      expect(modifyParentACount[EntityModifyFlags.Parent]).eq(0);
      expect(modifyParentBCount[EntityModifyFlags.Child]).eq(0);
      expect(modifyParentBCount[EntityModifyFlags.Parent]).eq(0);
      expect(modifyChildCount[EntityModifyFlags.Child]).eq(0);
      expect(modifyChildCount[EntityModifyFlags.Parent]).eq(1);

      child.siblingIndex = 2;
      expect(modifyParentACount[EntityModifyFlags.Child]).eq(2);
      expect(modifyParentACount[EntityModifyFlags.Parent]).eq(0);
      expect(modifyParentBCount[EntityModifyFlags.Child]).eq(0);
      expect(modifyParentBCount[EntityModifyFlags.Parent]).eq(0);
      expect(modifyChildCount[EntityModifyFlags.Child]).eq(0);
      expect(modifyChildCount[EntityModifyFlags.Parent]).eq(1);

      parentB.addChild(child);
      expect(modifyParentACount[EntityModifyFlags.Child]).eq(3);
      expect(modifyParentACount[EntityModifyFlags.Parent]).eq(0);
      expect(modifyParentBCount[EntityModifyFlags.Child]).eq(1);
      expect(modifyParentBCount[EntityModifyFlags.Parent]).eq(0);
      expect(modifyChildCount[EntityModifyFlags.Child]).eq(0);
      expect(modifyChildCount[EntityModifyFlags.Parent]).eq(2);
    });
  });

  describe("destroy", () => {
    it("normal", () => {
      const parent = new Entity(engine, "parent");

      parent.parent = scene.getRootEntity();
      const child = new Entity(engine, "child");
      child.parent = parent;
      child.destroy();
      expect(parent.children.length).eq(0);
    });

    it("children", () => {
      const entity = new Entity(engine, "entity");
      entity.createChild("child0");
      entity.createChild("child1");
      entity.createChild("child2");
      entity.createChild("child3");
      entity.createChild("child4");
      entity.destroy();
      expect(entity.children.length).eq(0);
    });

    it("addChildAfterDestroy", () => {
      class DestroyScript extends Script {
        onDisable(): void {}
        onDestroy(): void {}
      }
      DestroyScript.prototype.onDisable = vi.fn(DestroyScript.prototype.onDisable);
      DestroyScript.prototype.onDestroy = vi.fn(DestroyScript.prototype.onDestroy);

      const root = scene.createRootEntity("root");
      const entity = root.createChild("entity");
      const script = entity.addComponent(DestroyScript);
      entity.destroy();
      expect(entity.isActive).eq(false);
      expect(entity.isActiveInHierarchy).eq(false);
      expect(entity.parent).eq(null);
      expect(entity.scene).eq(null);
      expect(script.onDisable).toHaveBeenCalledTimes(1);

      expect(entity.createChild("child0").isActiveInHierarchy).eq(false);
      root.destroy();
      expect(root.isActive).eq(false);
      expect(root.isActiveInHierarchy).eq(false);
      expect(root.createChild("child1").isActiveInHierarchy).eq(false);

      engine.update();
      expect(script.onDestroy).toHaveBeenCalledTimes(1);
    });
  });

  describe("removeChild during onDisable", () => {
    it("should not crash when removing children during parent's onDisable", () => {
      // Issue #2947: Entity._scene is null in _onDisableInScene when child removed during parent's onDisable
      //
      // Entity tree: root → A → [B, C, D]
      // A has a script that removes all children in onDisable
      // B, C, D each have Script components
      // When root.removeChild(A), the two-phase batched approach causes:
      //   Phase 1: sets A/B/C/D._isActiveInScene = false, collects all components
      //   Phase 2: fires callbacks — A's onDisable removes B/C/D, clearing their _scene,
      //            then B/C/D's _onDisableInScene tries to access this.scene._componentsManager → crash

      const root = scene.createRootEntity("root");

      const A = new Entity(engine, "A");
      root.addChild(A);

      const B = new Entity(engine, "B");
      const C = new Entity(engine, "C");
      const D = new Entity(engine, "D");
      A.addChild(B);
      A.addChild(C);
      A.addChild(D);

      // A's script removes all children during onDisable
      class ParentScript extends Script {
        onDisable() {
          const children = [...this.entity.children];
          for (const child of children) {
            this.entity.removeChild(child);
          }
        }
      }
      A.addComponent(ParentScript);

      // B, C, D each have a Script component (triggers _onDisableInScene)
      B.addComponent(Script);
      C.addComponent(Script);
      D.addComponent(Script);

      // This should not throw "Cannot read properties of null (reading '_componentsManager')"
      expect(() => {
        root.removeChild(A);
      }).not.toThrow();
    });

    it("should not crash when sibling removes another sibling during onDisable", () => {
      // Entity tree: root → A → [B, C, D]
      // D's onDisable removes sibling C
      // With deferred callbacks, D fires first (children-first + reverse), then C's callback
      // should be skipped since C's _scene was cleared by D's removeChild

      const root = scene.createRootEntity("root");

      const A = new Entity(engine, "A");
      root.addChild(A);

      const B = new Entity(engine, "B");
      const C = new Entity(engine, "C");
      const D = new Entity(engine, "D");
      A.addChild(B);
      A.addChild(C);
      A.addChild(D);

      class SiblingRemoverScript extends Script {
        onDisable() {
          // D removes sibling C
          const parent = this.entity.parent;
          const c = parent.findByName("C");
          if (c && c.parent === parent) {
            parent.removeChild(c);
          }
        }
      }
      D.addComponent(SiblingRemoverScript);

      B.addComponent(Script);
      C.addComponent(Script);

      expect(() => {
        root.removeChild(A);
      }).not.toThrow();
    });

    it("should throw when child tries to removeChild its deactivating parent (reentrant)", () => {
      // Entity tree: root → A → B
      // B's onDisable tries to remove parent A — triggers reentrant _processInActive which should throw

      const root = scene.createRootEntity("root");

      const A = new Entity(engine, "A");
      root.addChild(A);

      const B = new Entity(engine, "B");
      A.addChild(B);

      class ReentrantScript extends Script {
        onDisable() {
          root.removeChild(this.entity.parent);
        }
      }
      B.addComponent(ReentrantScript);

      expect(() => {
        A.isActive = false;
      }).toThrow();
    });

    it("should not crash when setting sibling isActive=false during onDisable", () => {
      // Entity tree: root → A → [B, C]
      // B's onDisable sets C.isActive = false
      // C's _isActiveInScene is already false from Phase 1, so _processInActive is skipped
      // Phase 2 still triggers C's callback normally via _phasedActiveInScene

      const root = scene.createRootEntity("root");

      const A = new Entity(engine, "A");
      root.addChild(A);

      const B = new Entity(engine, "B");
      const C = new Entity(engine, "C");
      A.addChild(B);
      A.addChild(C);

      let cDisableCount = 0;

      class DeactivateSiblingScript extends Script {
        onDisable() {
          C.isActive = false;
        }
      }
      B.addComponent(DeactivateSiblingScript);

      C.addComponent(
        class extends Script {
          onDisable() {
            cDisableCount++;
          }
        }
      );

      root.removeChild(A);
      // C's onDisable should fire exactly once
      expect(cDisableCount).eq(1);
    });

    it("should fire deactivation callbacks in children-first order", () => {
      // Entity tree: root → A → [B, C]
      // Deactivation order should be: B, C (children) before A (parent)

      const root = scene.createRootEntity("root");

      const A = new Entity(engine, "A");
      root.addChild(A);

      const B = new Entity(engine, "B");
      const C = new Entity(engine, "C");
      A.addChild(B);
      A.addChild(C);

      const order: string[] = [];

      A.addComponent(
        class extends Script {
          onDisable() {
            order.push("A");
          }
        }
      );
      B.addComponent(
        class extends Script {
          onDisable() {
            order.push("B");
          }
        }
      );
      C.addComponent(
        class extends Script {
          onDisable() {
            order.push("C");
          }
        }
      );

      A.isActive = false;
      // Children-first + reverse: C, B, then A
      expect(order).toEqual(["C", "B", "A"]);
    });
  });

  describe("getComponentsIncludeChildren", () => {
    class ScriptA extends Script {}
    class ScriptB extends Script {}

    it("should return components in depth-first front-to-back order", () => {
      const root = new Entity(engine, "root");
      root.parent = scene.getRootEntity();

      const child0 = new Entity(engine, "child0");
      child0.parent = root;
      const child1 = new Entity(engine, "child1");
      child1.parent = root;

      const grandchild = new Entity(engine, "grandchild");
      grandchild.parent = child0;

      const compRoot = root.addComponent(ScriptA);
      const compChild0 = child0.addComponent(ScriptA);
      const compGrandchild = grandchild.addComponent(ScriptA);
      const compChild1 = child1.addComponent(ScriptA);

      const results: ScriptA[] = [];
      root.getComponentsIncludeChildren(ScriptA, results);

      expect(results).toEqual([compRoot, compChild0, compGrandchild, compChild1]);
    });

    it("should return multiple components per entity in add order", () => {
      const root = new Entity(engine, "root");
      root.parent = scene.getRootEntity();

      const comp1 = root.addComponent(ScriptA);
      const comp2 = root.addComponent(ScriptB);

      const results: Script[] = [];
      root.getComponentsIncludeChildren(Script, results);

      expect(results[0]).eq(comp1);
      expect(results[1]).eq(comp2);
    });
  });
});
