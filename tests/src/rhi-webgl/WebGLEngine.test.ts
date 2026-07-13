import { Camera, Entity, Script } from "@galacean/engine-core";
import { Vector3 } from "@galacean/engine-math";
import { WebGLEngine } from "@galacean/engine";
import { vi, describe, expect, it } from "vitest";

describe("webgl engine test", () => {
  it("create a webgl engine", async () => {
    const canvas = document.createElement("canvas");
    const engine = await WebGLEngine.create({ canvas });
    expect(engine).not.be.null;
  });

  it("engine destroy", async () => {
    class ParentScript extends Script {
      onAwake() {
        console.log("ParentScript___onAwake");
      }
      onEnable() {
        console.log("ParentScript___onEnable");
      }

      onDisable() {
        console.log("ParentScript___onDisable");
      }

      onUpdate() {
        console.log("ParentScript___onUpdate");
        this.engine.destroy();
      }
    }

    class ChildScript extends Script {
      onAwake() {
        console.log("ChildScript___onAwake");
      }
      onEnable() {
        console.log("ChildScript___onEnable");
      }

      onDisable() {
        console.log("ChildScript___onDisable");
      }

      onUpdate() {
        console.log("ChildScript___onUpdate");
      }
    }

    const canvas = document.createElement("canvas");
    const engine = await WebGLEngine.create({ canvas });
    const scene = engine.sceneManager.activeScene;
    const rootEntity = scene.createRootEntity();
    engine.run();

    // init camera
    const cameraEntity = rootEntity.createChild("camera");
    const camera = cameraEntity.addComponent(Camera);
    camera.isOrthographic = true;
    const pos = cameraEntity.transform.position;
    pos.set(0, 0, 50);
    cameraEntity.transform.position = pos;
    cameraEntity.transform.lookAt(new Vector3(0, 0, 0));

    const parentEntity = new Entity(engine);
    parentEntity.addComponent(ParentScript);
    const childEntity = parentEntity.createChild("test");
    childEntity.addComponent(ChildScript);
    rootEntity.addChild(parentEntity);
  });

  it("engine device lost", async () => {
    const engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
    engine.sceneManager.activeScene.createRootEntity().createChild("camera").addComponent(Camera);
    engine.run();

    const onLost = vi.fn(() => {
      console.log("On device lost.");
    });
    const onRestored = vi.fn(() => {
      console.log("On device restored.");
    });

    engine.on("devicelost", onLost);
    engine.on("devicerestored", onRestored);

    const originalOnError = window.onerror;
    let error: Error | null = null;
    window.onerror = (msg, src, line, col, err) => (error = err || new Error(String(msg)));

    try {
      engine.forceLoseDevice();
      await new Promise((r) => setTimeout(r, 100));
      expect(onLost).toHaveBeenCalledTimes(1);

      engine.forceRestoreDevice();
      await new Promise((r) => setTimeout(r, 100));
      expect(onRestored).toHaveBeenCalledTimes(1);

      if (error) throw error;
    } finally {
      window.onerror = originalOnError;
      engine.destroy();
    }
  });

  it("canvas auto resize", async () => {
    // create enters auto mode by default and attaches an observer.
    const canvas = document.createElement("canvas");
    const engine = await WebGLEngine.create({ canvas });
    engine.run();
    const webCanvas = engine.canvas;
    const observer = (webCanvas as any)._resizeObserver;
    expect(observer).toBeDefined();

    // Re-entering auto reuses the same observer and updates the scale.
    webCanvas.setAutoResolution(0.5);
    expect((webCanvas as any)._resizeObserver).toBe(observer);
    expect((webCanvas as any)._autoResolutionScale).toBe(0.5);

    // A pending resolution change is applied on the next frame pump. jsdom has no layout, so stub clientWidth/Height.
    Object.defineProperty(canvas, "clientWidth", { value: 800, configurable: true });
    Object.defineProperty(canvas, "clientHeight", { value: 600, configurable: true });
    (webCanvas as any)._resolutionDirty = true;
    (webCanvas as any)._pumpPendingResolution();
    expect((webCanvas as any)._resolutionDirty).toBe(false);
    expect(webCanvas.width).toBe(Math.round(800 * window.devicePixelRatio * 0.5));
    expect(webCanvas.height).toBe(Math.round(600 * window.devicePixelRatio * 0.5));

    // A pending resolution change is skipped while the canvas has no layout size (never a 0x0 buffer).
    Object.defineProperty(canvas, "clientWidth", { value: 0, configurable: true });
    (webCanvas as any)._resolutionDirty = true;
    (webCanvas as any)._pumpPendingResolution();
    expect((webCanvas as any)._resolutionDirty).toBe(true); // kept so a later frame's pump retries

    // setResolution locks a fixed size and exits auto mode (observer released).
    webCanvas.setResolution(320, 240);
    expect((webCanvas as any)._resizeObserver).toBeUndefined();
    expect(webCanvas.width).toBe(320);
    expect(webCanvas.height).toBe(240);

    // setResolution rejects invalid sizes; setAutoResolution rejects invalid scales.
    expect(() => webCanvas.setResolution(0, 100)).to.throw();
    expect(() => webCanvas.setResolution(-1, 100)).to.throw();
    expect(() => webCanvas.setAutoResolution(0)).to.throw();
    expect(() => webCanvas.setAutoResolution(-1)).to.throw();

    // destroy releases the observer.
    webCanvas.setAutoResolution();
    expect((webCanvas as any)._resizeObserver).toBeDefined();
    engine.destroy();
    expect((webCanvas as any)._resizeObserver).toBeUndefined();
  });

  it("auto resolution sizes from exact device pixels when available", async () => {
    const canvas = document.createElement("canvas");
    const engine = await WebGLEngine.create({ canvas });
    const webCanvas = engine.canvas;

    // Simulate a ResizeObserver callback that reported exact device pixels; the pump must apply only the
    // scale to them (the device pixel ratio is already folded in), taking the devicePixelContentBoxSize branch.
    webCanvas.setAutoResolution(0.5);
    (webCanvas as any)._pendingDevicePixelWidth = 400;
    (webCanvas as any)._pendingDevicePixelHeight = 300;
    Object.defineProperty(canvas, "clientWidth", { value: 200, configurable: true });
    Object.defineProperty(canvas, "clientHeight", { value: 150, configurable: true });
    (webCanvas as any)._resolutionDirty = true;
    (webCanvas as any)._pumpPendingResolution();
    expect(webCanvas.width).toBe(200); // round(400 * 0.5), dpr NOT re-applied
    expect(webCanvas.height).toBe(150); // round(300 * 0.5)

    engine.destroy();
  });

  it("auto resolution disables itself on a layout feedback loop", async () => {
    const canvas = document.createElement("canvas");
    const engine = await WebGLEngine.create({ canvas });
    const webCanvas = engine.canvas;
    expect((webCanvas as any)._resizeObserver).toBeDefined();

    // A canvas with no CSS size grows its display size when the buffer is set. Stub clientWidth/Height to
    // report a larger value after _setSize runs, so the pump detects the feedback loop and exits auto mode.
    let reportBig = false;
    Object.defineProperty(canvas, "clientWidth", { configurable: true, get: () => (reportBig ? 600 : 300) });
    Object.defineProperty(canvas, "clientHeight", { configurable: true, get: () => (reportBig ? 600 : 300) });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const originalSetSize = (webCanvas as any)._setSize.bind(webCanvas);
    (webCanvas as any)._setSize = (w: number, h: number) => {
      reportBig = true; // setting the buffer inflated the display size
      originalSetSize(w, h);
    };

    (webCanvas as any)._resolutionDirty = true;
    (webCanvas as any)._pumpPendingResolution();

    expect(warn).toHaveBeenCalled();
    expect((webCanvas as any)._resizeObserver).toBeUndefined(); // auto-resolution disabled
    warn.mockRestore();
    engine.destroy();
  });

  it("auto resolution falls back to a one-time sizing without ResizeObserver", async () => {
    const canvas = document.createElement("canvas");
    const engine = await WebGLEngine.create({ canvas });
    const webCanvas = engine.canvas;
    (webCanvas as any)._exitAutoResolution(); // drop the observer created by create()

    const originalRO = (globalThis as any).ResizeObserver;
    (globalThis as any).ResizeObserver = undefined;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    Object.defineProperty(canvas, "clientWidth", { value: 400, configurable: true });
    Object.defineProperty(canvas, "clientHeight", { value: 200, configurable: true });

    webCanvas.setAutoResolution(1);

    expect(warn).toHaveBeenCalled();
    expect((webCanvas as any)._resizeObserver).toBeUndefined(); // no observer, sized once instead
    expect(webCanvas.width).toBe(Math.round(400 * window.devicePixelRatio));
    expect(webCanvas.height).toBe(Math.round(200 * window.devicePixelRatio));

    (globalThis as any).ResizeObserver = originalRO;
    warn.mockRestore();
    engine.destroy();
  });

  it("the client-size fallback skips a canvas with no layout size", async () => {
    const canvas = document.createElement("canvas");
    const engine = await WebGLEngine.create({ canvas });
    const webCanvas = engine.canvas;

    Object.defineProperty(canvas, "clientWidth", { value: 0, configurable: true });
    Object.defineProperty(canvas, "clientHeight", { value: 0, configurable: true });
    const before = webCanvas.width;
    (webCanvas as any)._setSizeByClientSizeFallback(1);
    expect(webCanvas.width).toBe(before); // unchanged, no 0x0 buffer

    engine.destroy();
  });

  it("auto resolution is a no-op for an OffscreenCanvas", async () => {
    const canvas = document.createElement("canvas");
    const engine = await WebGLEngine.create({ canvas });
    const webCanvas = engine.canvas;
    (webCanvas as any)._exitAutoResolution();

    // Force the OffscreenCanvas branch: setAutoResolution must return before attaching an observer.
    vi.spyOn(webCanvas as any, "_isOffscreenCanvas").mockReturnValue(true);
    webCanvas.setAutoResolution();
    expect((webCanvas as any)._resizeObserver).toBeUndefined();

    engine.destroy();
  });
});
