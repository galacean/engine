import { WebEngine, WebCanvas, WebGLRenderer } from "../../rhi-webgl";
import { Engine, Scene } from "../";

async function delay(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

describe("Engine test", () => {
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
    getExtension: jest.fn()
  });

  const canvasDOM = document.createElement("canvas");
  canvasDOM.getContext = getContext;

  const offscreenCanvasDOM = <OffscreenCanvas | any>{
    width: 1024,
    height: 1024,
    getContext
  };

  describe("test - 引擎创建/销毁", () => {
    describe("web 端引擎", () => {
      it("直接调用引擎源码", () => {
        const canvas = new WebCanvas(canvasDOM);
        const rhi = new WebGLRenderer();
        const engine = new Engine(canvas, rhi);

        expect(engine.canvas).toBe(canvas);
        expect(engine.hardwareRenderer).toBe(rhi);
        expect(Engine._getDefaultEngine()).toBe(engine);
      });

      it("使用封装的 WebEngine", () => {
        const engine = new WebEngine(canvasDOM);

        expect(engine.hardwareRenderer).toBeInstanceOf(WebGLRenderer);
      });

      it("离屏 canvas", () => {
        const canvas = new WebCanvas(offscreenCanvasDOM);
        const rhi = new WebGLRenderer();
        const engine = new Engine(canvas, rhi);

        expect(engine.canvas).toBe(canvas);
        expect(engine.hardwareRenderer).toBeInstanceOf(WebGLRenderer);
        expect(canvas.width).toBe(1024);
        expect(canvas.height).toBe(1024);
      });

      it("销毁", () => {
        const engine = new WebEngine(canvasDOM);

        engine.destroy();
        expect(engine.scene).toBeUndefined();
        expect(engine.isPaused).toBeTruthy();
      });
    });
  });

  describe("test - sceneManager", () => {
    it("默认 scene", () => {
      const engine = new WebEngine(canvasDOM);

      expect(engine.scene).toBeInstanceOf(Scene);
    });
    it("销毁 scene", () => {
      const engine = new WebEngine(canvasDOM);
      const scene = engine.scene;
      scene.destroy();

      expect(engine.scene).toBeNull();
    });
  });

  describe("test - tick/垂直同步", () => {
    const engine = new WebEngine(canvasDOM);
    const mockTick = ((<any>engine)._tick = jest.fn());

    it("默认垂直同步 pause/resume", async () => {
      mockTick.mockReset();
      engine.run();
      await delay(100);

      expect(mockTick).toBeCalled();

      mockTick.mockReset();
      engine.pause();
      await delay(100);
      expect(mockTick).not.toBeCalled();
      expect(engine.isPaused).toBeTruthy();

      mockTick.mockReset();
      engine.resume();
      await delay(100);
      expect(mockTick).toBeCalled();
      expect(engine.isPaused).toBeFalsy();
    });

    it("关闭垂直同步", async () => {
      mockTick.mockReset();
      engine.vSyncCount = 0;
      engine.targetFrameRate = 50; // 1000 / 50 = 20 ms
      await delay(100);

      // 50帧,最少 4 次
      expect(engine.vSyncCount).toBe(0);
      expect(engine.targetFrameRate).toBe(50);
      expect(mockTick).not.toBeCalledTimes(0);
      expect(mockTick).not.toBeCalledTimes(1);
      expect(mockTick).not.toBeCalledTimes(2);
      expect(mockTick).not.toBeCalledTimes(3);

      mockTick.mockReset();
      engine.targetFrameRate = 10; // 1000 / 10 = 100 ms
      await delay(100);

      // 10 帧最多跑一次
      expect(engine.vSyncCount).toBe(0);
      expect(engine.targetFrameRate).toBe(10);
      expect(mockTick).not.toBeCalledTimes(2);
      expect(mockTick).not.toBeCalledTimes(3);
    });
  });
});
