import { WebGLEngine } from "../../rhi-webgl/src";
import { Entity, Camera, RenderableComponent } from "../";

async function delay(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

describe("Scene test", () => {
  const getContext = jest.fn().mockReturnValue({
    canvas: { width: 1024, height: 1024 },
    getParameter: jest.fn(),
    enable: jest.fn(),
    disable: jest.fn(),
    colorMask: jest.fn(),
    depthMask: jest.fn(),
    blendFunc: jest.fn(),
    cullFace: jest.fn(),
    frontFace: jest.fn(),
    depthFunc: jest.fn(),
    depthRange: jest.fn(),
    polygonOffset: jest.fn(),
    stencilFunc: jest.fn(),
    stencilMask: jest.fn(),
    getExtension: jest.fn(),
    bindFramebuffer: jest.fn(),
    viewport: jest.fn(),
    clearColor: jest.fn(),
    clear: jest.fn()
  });

  const canvasDOM = document.createElement("canvas");
  canvasDOM.getContext = getContext;

  const engine = new WebGLEngine(canvasDOM);
  const scene = engine.sceneManager.activeScene;
  engine.run();

  describe("test - 根节点", () => {
    const entity = new Entity();

    it("默认无根节点", () => {
      expect(scene.rootEntitiesCount).toBe(0);
      expect(scene.engine).not.toBe(null);
    });

    it("增加根节点", () => {
      scene.addRootEntity(entity);
      expect(scene.rootEntitiesCount).toBe(1);
      expect(scene.getRootEntity()).toBe(entity);
    });

    it("分根节点渲染", async () => {
      const camera = entity.addComponent(Camera);
      const child = new Entity("child");
      entity.addChild(child);

      class TestComponent extends RenderableComponent {
        render = jest.fn();
      }
      child.addComponent(TestComponent);
      const testComponent = child.getComponent(TestComponent);
      await delay(100);

      expect(camera._renderPipeline).toBeDefined();
      expect(testComponent.render).toBeCalled();

      // remove root
      scene.removeRootEntity(entity);
      testComponent.render.mockReset();
      await delay(100);
      expect(testComponent.render).not.toBeCalled();

      scene.addRootEntity(entity);
    });

    it("删除根节点", () => {
      expect(scene.rootEntitiesCount).toBe(1);
      scene.removeRootEntity(entity);
      expect(scene.rootEntitiesCount).toBe(0);
      expect(scene.getRootEntity()).not.toBeDefined();

      scene.addRootEntity(entity);
    });
  });

  it("test - 销毁", () => {
    // 销毁前
    expect(scene.destroyed).toBeFalsy();
    expect(scene.rootEntitiesCount).not.toBe(0);

    // 销毁后
    scene.destroy();
    expect(scene.destroy).toBeTruthy();
    expect(scene.rootEntitiesCount).toBe(0);
    expect(scene.engine.sceneManager.activeScene).not.toBe(scene);
  });
});
