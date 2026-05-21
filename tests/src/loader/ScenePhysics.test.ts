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
      name: "physics-scene",
      entities: [],
      scene: {
        background: {
          mode: BackgroundMode.SolidColor,
          color: { r: 0, g: 0, b: 0, a: 1 }
        },
        physics: {
          gravity: { x: 0, y: -3200, z: 0 },
          fixedTimeStep: 1 / 120
        }
      },
      files: []
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
