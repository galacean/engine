import { Entity, EntityModifyFlags, Scene, Script } from "@galacean/engine-core";
import { WebGLEngine } from "@galacean/engine-rhi-webgl";
import { beforeEach, describe, expect, it, vi } from "vitest";

class TestComponent extends Script {}

describe("Entity", async () => {
  const engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
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
      parent.clearChildren();
      expect(parent.children.length).eq(0);
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

      // thorw error when set lonely entity
      const entityX = new Entity(engine, "entityX");
      var lonelyBadFn = function () {
        entityX.siblingIndex = 1;
      };
      expect(lonelyBadFn).to.throw();
    });

    it("isRoot", () => {
      const parent = scene.createRootEntity("parent");
      const child = scene.createRootEntity("child");
      parent.addChild(child);
      scene.addRootEntity(child);
      // @ts-ignore
      expect(child._isRoot).eq(true);
      child.parent = parent;
      // @ts-ignore
      expect(child._isRoot).eq(false);
      scene.addRootEntity(child);
      // @ts-ignore
      expect(child._isRoot).eq(true);
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
});
