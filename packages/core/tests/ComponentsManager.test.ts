import { Camera } from "../src/Camera";
import { Engine, Entity, Renderer, Script } from "../src/index";
import { RenderContext } from "../src/RenderPipeline/RenderContext";

describe("ComponentsManager", () => {
  let engine: Engine = new Engine({ width: 1024, height: 1024 }, { init: jest.fn(), canIUse: jest.fn() });
  let scene;
  let camera: Camera;
  let rootNode: Entity;
  beforeEach(() => {
    const width = 1024;
    const height = 1024;
    scene = engine.sceneManager.activeScene;
    rootNode = engine.sceneManager.activeScene.createRootEntity();
    camera = rootNode.addComponent(Camera);
    engine.sceneManager.activeScene = scene;
    //@ts-ignore
    Entity._entitys.length = 0;
    //@ts-ignore
    Entity._entitys._elements.length = 0;
    const rhi: any = {
      gl: document.createElement("canvas").getContext("webgl"),
      canIUse: jest.fn().mockReturnValue(true),
      activeRenderTarget: jest.fn().mockReturnValue(true),
      setRenderTargetFace: jest.fn().mockReturnValue(true),
      clearRenderTarget: jest.fn().mockReturnValue(true),
      blitRenderTarget: jest.fn().mockReturnValue(true)
    };
    engine._hardwareRenderer = rhi;
  });

  describe("Component", () => {
    class TestComponent extends Script {
      onUpdate() {}
    }
    it("onUpdate", () => {
      const entity = new Entity(engine, "entity");
      entity.parent = scene.getRootEntity();
      TestComponent.prototype.onUpdate = jest.fn();
      const component = entity.addComponent(TestComponent);
      engine.update();
      engine.update();
      expect(component.onUpdate).toHaveBeenCalledTimes(2);
    });
    // TODO 这条没过有问题
    // it("inActive", () => {
    //   const entity = new Entity(engine, "entity");
    //   entity.parent = scene.getRootEntity();
    //   TestComponent.prototype.onUpdate = jest.fn();
    //   const component = entity.addComponent(TestComponent);
    //   entity.isActive = false;
    //   engine.update();
    //   engine.update();
    //   expect(component.onUpdate).toHaveBeenCalledTimes(0);
    // });
  });

  describe("Renderer", () => {
    it("onUpdate", () => {
      class TestComponent extends Renderer {
        update() {}
        render() {}
      }
      const entity = new Entity(engine, "entity");
      entity.parent = scene.getRootEntity();
      TestComponent.prototype.update = jest.fn();
      const component = entity.addComponent(TestComponent);
      engine._componentsManager.callScriptOnStart();
      engine._componentsManager.callRendererOnUpdate(16.7);
      engine._componentsManager.callScriptOnStart();
      engine._componentsManager.callRendererOnUpdate(16.7);
      expect(component.update).toHaveBeenCalledTimes(2);
    });

    it("render", () => {
      class TestComponent extends Renderer {
        update() {}
        render() {}
      }
      const entity = new Entity(engine, "entity");
      entity.parent = scene.getRootEntity();
      TestComponent.prototype.render = jest.fn();
      const component = entity.addComponent(TestComponent);
      engine._componentsManager.callScriptOnStart();
      engine._componentsManager.callRender(RenderContext._getRenderContext(camera));
      engine._componentsManager.callScriptOnStart();
      engine._componentsManager.callRender(RenderContext._getRenderContext(camera));
      expect(component.render).toHaveBeenCalledTimes(2);
    });

    it("inActive", () => {
      class TestComponent extends Renderer {
        update() {}
        render() {}
      }
      const entity = new Entity(engine, "entity");
      entity.parent = scene.getRootEntity();
      TestComponent.prototype.update = jest.fn();
      TestComponent.prototype.render = jest.fn();
      const component = entity.addComponent(TestComponent);
      entity.isActive = false;
      engine._componentsManager.callRendererOnUpdate(16.7);
      engine._componentsManager.callRender(RenderContext._getRenderContext(camera));
      expect(component.update).toHaveBeenCalledTimes(0);
      expect(component.render).toHaveBeenCalledTimes(0);
    });
  });
});
