import { Entity, MeshRenderer, Script } from "@galacean/engine-core";
import { WebGLEngine } from "@galacean/engine-rhi-webgl";
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

describe("CloneUtils", async () => {
  const engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
  const scene = engine.sceneManager.activeScene;
  engine.run();

  describe("Entity/Component remap on clone", () => {
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
});
