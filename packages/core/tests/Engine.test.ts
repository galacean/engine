import { WebCanvas, WebGLEngine, WebGLRenderer } from "../../rhi-webgl/src";
import { Engine } from "../src";

describe("Engine test", () => {
  describe("test - create and destroy engine ", () => {
    it("use Engine", () => {
      const canvas = new WebCanvas(document.createElement("canvas"));
      const rhi = new WebGLRenderer();
      const engine = new Engine(canvas, rhi);

      expect(engine.canvas).toBe(canvas);
      expect(engine._hardwareRenderer).toBe(rhi);
    });

    it("Use WebGLEngine", () => {
      const engine = new WebGLEngine(document.createElement("canvas"));

      expect(engine._hardwareRenderer).toBeInstanceOf(WebGLRenderer);
    });

    it("Use offscreen canvas", () => {
      const canvas = new WebCanvas(new OffscreenCanvas(1024, 1024));
      const rhi = new WebGLRenderer();
      const engine = new Engine(canvas, rhi);

      expect(engine.canvas).toBe(canvas);
      expect(engine._hardwareRenderer).toBeInstanceOf(WebGLRenderer);
      expect(canvas.width).toBe(1024);
      expect(canvas.height).toBe(1024);
    });

    it("Destroy engine", () => {
      const engine = new WebGLEngine(document.createElement("canvas"));

      engine.destroy();
      expect(engine.sceneManager).toBeNull();
      expect(engine.isPaused).toBeTruthy();
    });
  });

  describe("test - sceneManager", () => {
    it("Default scene", () => {
      const engine = new WebGLEngine(document.createElement("canvas"));

      expect(engine.sceneManager.activeScene).not.toBeNull();
    });
    it("Destroy scene", () => {
      const engine = new WebGLEngine(document.createElement("canvas"));
      const scene = engine.sceneManager.activeScene;
      scene.destroy();

      expect(engine.sceneManager.activeScene).toBeNull();
    });
  });

  describe("test - tick/vSync", () => {
    const engine = new WebGLEngine(document.createElement("canvas"));
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
