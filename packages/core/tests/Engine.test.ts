import { WebCanvas, WebGLEngine, WebGLRenderer } from "../../rhi-webgl/src";
import { Engine } from "../src";

describe("Engine test", () => {
  const getContext = jest.fn().mockReturnValue({
    canvas: { width: 1024, height: 1024 },
    getParameter: jest.fn(),
    enable: jest.fn(),
    disable: jest.fn(),
    colorMask: jest.fn(),
    depthMask: jest.fn(),
    blendFunc: jest.fn(),
    blendFuncSeparate: jest.fn(),
    blendEquationSeparate: jest.fn(),
    blendColor: jest.fn(),
    cullFace: jest.fn(),
    frontFace: jest.fn(),
    depthFunc: jest.fn(),
    depthRange: jest.fn(),
    polygonOffset: jest.fn(),
    stencilFunc: jest.fn(),
    stencilFuncSeparate: jest.fn(),
    stencilMask: jest.fn(),
    stencilOpSeparate: jest.fn(),
    getExtension: jest.fn(),
    bindFramebuffer: jest.fn(),
    viewport: jest.fn(),
    clearColor: jest.fn(),
    clear: jest.fn()
  });

  const canvasDOM = document.createElement("canvas");
  canvasDOM.getContext = getContext;

  const offscreenCanvasDOM = <OffscreenCanvas | any>{
    width: 1024,
    height: 1024,
    getContext
  };

  describe("test - create and destroy engine ", () => {
    describe("Web platform engine", () => {
      it("use Engine", () => {
        const canvas = new WebCanvas(canvasDOM);
        const rhi = new WebGLRenderer();
        const engine = new Engine(canvas, rhi);

        expect(engine.canvas).toBe(canvas);
        expect(engine._hardwareRenderer).toBe(rhi);
      });

      it("Use WebGLEngine", () => {
        const engine = new WebGLEngine(canvasDOM);

        expect(engine._hardwareRenderer).toBeInstanceOf(WebGLRenderer);
      });

      it("Use offscreen canvas", () => {
        const canvas = new WebCanvas(offscreenCanvasDOM);
        const rhi = new WebGLRenderer();
        const engine = new Engine(canvas, rhi);

        expect(engine.canvas).toBe(canvas);
        expect(engine._hardwareRenderer).toBeInstanceOf(WebGLRenderer);
        expect(canvas.width).toBe(1024);
        expect(canvas.height).toBe(1024);
      });

      it("Destroy engine", () => {
        const engine = new WebGLEngine(canvasDOM);

        engine.destroy();
        expect(engine.sceneManager).toBeNull();
        expect(engine.isPaused).toBeTruthy();
      });
    });
  });

  describe("test - sceneManager", () => {
    it("Default scene", () => {
      const engine = new WebGLEngine(canvasDOM);

      expect(engine.sceneManager.activeScene).not.toBeNull();
    });
    it("Destroy scene", () => {
      const engine = new WebGLEngine(canvasDOM);
      const scene = engine.sceneManager.activeScene;
      scene.destroy();

      expect(engine.sceneManager.activeScene).toBeNull();
    });
  });

  describe("test - tick/vSync", () => {
    const engine = new WebGLEngine(canvasDOM);
    const mockTick = (engine.update = jest.fn());

    it("Open vsync - pause/resume", () => {
      mockTick.mockReset();
      engine.run();

      setTimeout(() => {
        expect(mockTick).toBeCalled();
        engine.pause();
        mockTick.mockReset();
        setTimeout(() => {
          expect(mockTick).not.toBeCalled();
          expect(engine.isPaused).toBeTruthy();
          mockTick.mockReset();
          engine.resume();
          setTimeout(() => {
            expect(mockTick).toBeCalled();
            expect(engine.isPaused).toBeFalsy();
          }, 100);
        }, 100);
      }, 100);
    });

    it("Close vsync", () => {
      mockTick.mockReset();
      engine.vSyncCount = 0;
      engine.targetFrameRate = 50; // 1000 / 50 = 20 ms
      setTimeout(() => {
        // run at least 4 times in 50 fps,
        expect(engine.vSyncCount).toBe(0);
        expect(engine.targetFrameRate).toBe(50);
        expect(mockTick).not.toBeCalledTimes(0);
        expect(mockTick).not.toBeCalledTimes(1);
        expect(mockTick).not.toBeCalledTimes(2);
        expect(mockTick).not.toBeCalledTimes(3);

        mockTick.mockReset();
        engine.targetFrameRate = 10; // 1000 / 10 = 100 ms

        setTimeout(() => {
          // run at most 1 time in 10 fps
          expect(engine.vSyncCount).toBe(0);
          expect(engine.targetFrameRate).toBe(10);
          expect(mockTick).not.toBeCalledTimes(2);
          expect(mockTick).not.toBeCalledTimes(3);
        }, 100);
      }, 100);
    });
  });
});
