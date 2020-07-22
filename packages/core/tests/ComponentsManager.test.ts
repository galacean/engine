import { Entity, Component, Engine, Scene, RenderableComponent, Script } from "../src/index";
describe("ComponentsManager", () => {
  let engine = null;
  let scene = null;
  beforeEach(() => {
    engine = new Engine();
    scene = new Scene(engine);
    Entity._nodes.length = 0;
    Entity._nodes._elements.length = 0;
  });

  describe("Component", () => {
    class TestComponent extends Script {
      onUpdate() {}
    }
    it("onUpdate", () => {
      const entity = new Entity("node");
      entity.parent = scene.root;
      TestComponent.prototype.onUpdate = jest.fn();
      const component = entity.addComponent(TestComponent);
      scene.update(16.7);
      scene.update(16.7);
      expect(component.onUpdate).toHaveBeenCalledTimes(2);
    });

    it("inActive", () => {
      const entity = new Entity("node");
      entity.parent = scene.root;
      TestComponent.prototype.onUpdate = jest.fn();
      const component = entity.addComponent(TestComponent);
      entity.isActive = false;
      scene.update(16.7);
      scene.update(16.7);
      expect(component.onUpdate).toHaveBeenCalledTimes(0);
    });
  });

  describe("RenderableComponent", () => {
    it("onUpdate", () => {
      class TestComponent extends RenderableComponent {
        update() {}
        render() {}
      }
      const entity = new Entity("node");
      entity.parent = scene.root;
      TestComponent.prototype.update = jest.fn();
      const component = entity.addComponent(TestComponent);
      scene._componentsManager.callScriptOnStart();
      scene._componentsManager.callRendererOnUpdate(16.7);
      scene._componentsManager.callScriptOnStart();
      scene._componentsManager.callRendererOnUpdate(16.7);
      expect(component.update).toHaveBeenCalledTimes(2);
    });

    it("render", () => {
      class TestComponent extends RenderableComponent {
        update() {}
        render() {}
      }
      const entity = new Entity("node");
      entity.parent = scene.root;
      TestComponent.prototype.render = jest.fn();
      const component = entity.addComponent(TestComponent);
      scene._componentsManager.callScriptOnStart();
      scene._componentsManager.callRender();
      scene._componentsManager.callScriptOnStart();
      scene._componentsManager.callRender();
      expect(component.render).toHaveBeenCalledTimes(2);
    });

    it("inActive", () => {
      class TestComponent extends RenderableComponent {
        update() {}
        render() {}
      }
      const entity = new Entity("node");
      entity.parent = scene.root;
      TestComponent.prototype.update = jest.fn();
      TestComponent.prototype.render = jest.fn();
      const component = entity.addComponent(TestComponent);
      entity.isActive = false;
      scene._componentsManager.callRendererOnUpdate(16.7);
      scene._componentsManager.callRender();
      expect(component.update).toHaveBeenCalledTimes(0);
      expect(component.render).toHaveBeenCalledTimes(0);
    });
  });
});
