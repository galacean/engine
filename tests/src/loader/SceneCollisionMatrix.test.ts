import { AssetType, BackgroundMode, Layer, Scene, WebGLEngine } from "@galacean/engine";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPhysics } from "../utils/physics";

function sceneData(disabledCollisionMasks?: number[]) {
  return {
    version: "2.0",
    refs: [],
    entities: [],
    components: [],
    scene: {
      rootEntities: [],
      background: { mode: BackgroundMode.SolidColor, color: [0, 0, 0, 1] },
      physics: { disabledCollisionMasks }
    }
  };
}

async function loadScene(engine: WebGLEngine, data: ReturnType<typeof sceneData>): Promise<Scene> {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: "application/json" }));
  try {
    return await engine.resourceManager.load<Scene>({ url, type: AssetType.Scene });
  } finally {
    URL.revokeObjectURL(url);
  }
}

describe("scene collision matrix", () => {
  let engine: WebGLEngine;

  beforeAll(async () => {
    engine = await WebGLEngine.create({ canvas: document.createElement("canvas"), physics: createPhysics() });
  });
  afterAll(() => engine.destroy());

  it("loads symmetric collision exclusions independently per scene, including Layer31", async () => {
    const configured = await loadScene(engine, sceneData([0, Layer.Layer1 + Layer.Layer31]));
    const defaultScene = await loadScene(engine, sceneData());
    try {
      const physics = configured.physics;
      expect(physics.getColliderLayerCollision(Layer.Layer31, Layer.Layer1)).toBe(false);
      expect(physics.getColliderLayerCollision(Layer.Layer1, Layer.Layer1)).toBe(false);
      expect(physics.getColliderLayerCollision(Layer.Layer1, Layer.Layer2)).toBe(true);
      expect(defaultScene.physics.getColliderLayerCollisionMask(Layer.Layer1)).toBe(Layer.Everything);

      physics.setColliderLayerCollisionMask(Layer.Layer1, Layer.Layer0 | Layer.Layer31);
      expect(physics.getColliderLayerCollisionMask(Layer.Layer1)).toBe(Layer.Layer0 + Layer.Layer31);
      expect(physics.getColliderLayerCollision(Layer.Layer31, Layer.Layer1)).toBe(true);
      expect(physics.getColliderLayerCollision(Layer.Layer2, Layer.Layer1)).toBe(false);
      expect(defaultScene.physics.getColliderLayerCollision(Layer.Layer2, Layer.Layer1)).toBe(true);
    } finally {
      configured.destroy();
      defaultScene.destroy();
    }
  });

  it("rejects an exclusion in the wrong row", async () => {
    await expect(loadScene(engine, sceneData([0, Layer.Layer0]))).rejects.toThrow(
      "scene.physics.disabledCollisionMasks[1]"
    );
  });

  it("loads scene metadata when the engine has no physics backend", async () => {
    const renderEngine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
    try {
      const scene = await loadScene(renderEngine, sceneData([Layer.Layer31]));
      scene.destroy();
    } finally {
      renderEngine.destroy();
    }
  });
});
