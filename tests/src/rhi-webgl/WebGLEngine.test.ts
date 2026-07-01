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
    // autoResize defaults to true: create enters auto mode and attaches an observer.
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

    // A pending resize is applied on the next frame pump. jsdom has no layout, so stub clientWidth/Height.
    Object.defineProperty(canvas, "clientWidth", { value: 800, configurable: true });
    Object.defineProperty(canvas, "clientHeight", { value: 600, configurable: true });
    (webCanvas as any)._pendingResize = true;
    webCanvas._pumpPendingResize();
    expect((webCanvas as any)._pendingResize).toBe(false);
    expect(webCanvas.width).toBe(Math.round(800 * window.devicePixelRatio * 0.5));
    expect(webCanvas.height).toBe(Math.round(600 * window.devicePixelRatio * 0.5));

    // A pending resize is skipped while the canvas has no layout size (never a 0x0 buffer).
    Object.defineProperty(canvas, "clientWidth", { value: 0, configurable: true });
    (webCanvas as any)._pendingResize = true;
    webCanvas._pumpPendingResize();
    expect((webCanvas as any)._pendingResize).toBe(true); // kept for a later valid observe

    // setResolution locks a fixed size and exits auto mode (observer released).
    webCanvas.setResolution(320, 240);
    expect((webCanvas as any)._resizeObserver).toBeUndefined();
    expect(webCanvas.width).toBe(320);
    expect(webCanvas.height).toBe(240);

    // setResolution rejects invalid sizes.
    expect(() => webCanvas.setResolution(0, 100)).to.throw();
    expect(() => webCanvas.setResolution(-1, 100)).to.throw();

    // destroy releases the observer.
    webCanvas.setAutoResolution();
    expect((webCanvas as any)._resizeObserver).toBeDefined();
    engine.destroy();
    expect((webCanvas as any)._resizeObserver).toBeUndefined();
  });

  it("autoResize false disables the default follow", async () => {
    const canvas = document.createElement("canvas");
    const engine = await WebGLEngine.create({ canvas, autoResize: false });
    // No observer attached when auto-resize is opted out.
    expect((engine.canvas as any)._resizeObserver).toBeUndefined();
    engine.destroy();
  });
});
