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
    const canvas = document.createElement("canvas");
    const engine = await WebGLEngine.create({ canvas });
    const scene = engine.sceneManager.activeScene;
    const rootEntity = scene.createRootEntity();

    // init camera
    const cameraEntity = rootEntity.createChild("camera");
    const camera = cameraEntity.addComponent(Camera);

    engine.run();

    const opLost = vi.fn(() => {
      console.log("On device lost.");
    });
    const onRestored = vi.fn(() => {
      console.log("On device restored.");
    });

    engine.on("devicelost", opLost);
    engine.on("devicerestored", onRestored);

    return new Promise<void>((resolve, reject) => {
      // Set up error tracking
      const originalOnError = window.onerror;
      let errorCaught: Error | null = null;

      window.onerror = (message, source, lineno, colno, error) => {
        errorCaught = error || new Error(String(message));
        console.error("Error caught during device lost test:", {
          message: errorCaught.message,
          source,
          lineno,
          colno,
          stack: errorCaught.stack
        });
        return originalOnError ? originalOnError(message, source, lineno, colno, error) : false;
      };

      engine.forceLoseDevice();

      setTimeout(() => {
        try {
          expect(opLost).toHaveBeenCalledTimes(1);
          engine.forceRestoreDevice();

          setTimeout(() => {
            window.onerror = originalOnError;
            engine.destroy();

            if (errorCaught) {
              reject(errorCaught);
            } else {
              resolve();
            }
          }, 1100);
        } catch (err) {
          window.onerror = originalOnError;
          engine.destroy();
          reject(err);
        }
      }, 100);
    });
  });
});
