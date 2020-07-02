import { Node, NodeAbility, Engine, Scene, RenderableComponent } from "../src/index";
describe("ComponentsManager", () => {
  let engine = null;
  let scene = null;
  beforeEach(() => {
    engine = new Engine();
    scene = new Scene(engine);
    Node._nodes.length = 0;
    Node._nodes._elements.length = 0;
  });

  describe("Component", () => {
    class TestComponent extends NodeAbility {
      onUpdate() {}
    }
    it("onUpdate", () => {
      const node = new Node(scene, scene.root, "node");
      TestComponent.prototype.onUpdate = jest.fn();
      const component = node.addComponent(TestComponent);
      scene.update(16.7);
      scene.update(16.7);
      expect(component.onUpdate).toHaveBeenCalledTimes(2);
    });

    it("inActive", () => {
      const node = new Node(scene, scene.root, "node");
      TestComponent.prototype.onUpdate = jest.fn();
      const component = node.addComponent(TestComponent);
      node.isActive = false;
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
      const node = new Node(scene, scene.root, "node");
      TestComponent.prototype.update = jest.fn();
      const component = node.addComponent(TestComponent);
      scene._componentsManager.callRendererOnUpdate(16.7);
      scene._componentsManager.callRendererOnUpdate(16.7);
      expect(component.update).toHaveBeenCalledTimes(2);
    });

    it("render", () => {
      class TestComponent extends RenderableComponent {
        update() {}
        render() {}
      }
      const node = new Node(scene, scene.root, "node");
      TestComponent.prototype.render = jest.fn();
      const component = node.addComponent(TestComponent);
      scene._componentsManager.callRender();
      scene._componentsManager.callRender();
      expect(component.render).toHaveBeenCalledTimes(2);
    });

    it("inActive", () => {
      class TestComponent extends RenderableComponent {
        update() {}
        render() {}
      }
      const node = new Node(scene, scene.root, "node");
      TestComponent.prototype.update = jest.fn();
      TestComponent.prototype.render = jest.fn();
      const component = node.addComponent(TestComponent);
      node.isActive = false;
      scene._componentsManager.callRendererOnUpdate(16.7);
      scene._componentsManager.callRender();
      expect(component.update).toHaveBeenCalledTimes(0);
      expect(component.render).toHaveBeenCalledTimes(0);
    });
  });
});
