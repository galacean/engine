import { AssetType, BackgroundMode, Scene } from "@galacean/engine";
import "@galacean/engine-loader";
import { PhysXPhysics } from "@galacean/engine-physics-physx";
import { WebGLEngine } from "@galacean/engine-rhi-webgl";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let engine: WebGLEngine;

beforeAll(async () => {
  engine = await WebGLEngine.create({
    canvas: document.createElement("canvas"),
    physics: new PhysXPhysics()
  });
});

afterAll(() => {
  engine?.destroy();
});

describe("SceneLoader physics settings", () => {
  it("applies serialized scene physics settings to PhysicsScene", async () => {
    const sceneData = {
      version: "2.0",
      refs: [],
      entities: [],
      components: [],
      scene: {
        name: "physics-scene",
        rootEntities: [],
        background: {
          mode: BackgroundMode.SolidColor,
          color: [0, 0, 0, 1]
        },
        physics: {
          gravity: [0, -3200, 0],
          fixedTimeStep: 1 / 120
        }
      }
    };
    const sceneUrl =
      URL.createObjectURL(new Blob([JSON.stringify(sceneData)], { type: "application/json" })) + "#.scene";

    const scene = await engine.resourceManager.load<Scene>({
      url: sceneUrl,
      type: AssetType.Scene
    });

    expect(scene.physics.gravity.x).toBe(0);
    expect(scene.physics.gravity.y).toBe(-3200);
    expect(scene.physics.gravity.z).toBe(0);
    expect(scene.physics.fixedTimeStep).toBe(1 / 120);
  });
});
