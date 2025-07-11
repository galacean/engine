import { Camera, Entity, Script } from "@galacean/engine-core";
import { Vector3 } from "@galacean/engine-math";
import { WebGLEngine } from "@galacean/engine-rhi-webgl";
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
});
