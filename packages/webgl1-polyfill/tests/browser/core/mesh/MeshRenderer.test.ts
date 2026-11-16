import {
  Camera,
  Color,
  MeshRenderer,
  PrimitiveMesh,
  UnlitMaterial,
  Vector3
} from "../../../../../galacean/dist/module.js";
import { expect, it, vi } from "vitest";
import { createEngine } from "../../../helpers/createEngine";

it("does not batch identical render elements without instancing", async () => {
  const { engine, gl } = await createEngine(["ANGLE_instanced_arrays"]);
  try {
    const scene = engine.sceneManager.activeScene!;
    const cameraEntity = scene.createRootEntity();
    cameraEntity.transform.setPosition(0, 0, 5);
    const camera = cameraEntity.addComponent(Camera);
    camera.enablePostProcess = false;
    const mesh = PrimitiveMesh.createCuboid(engine);
    const material = new UnlitMaterial(engine);
    material.baseColor = new Color(1, 0, 0, 1);
    for (const x of [-0.5, 0.5]) {
      const entity = scene.createRootEntity();
      entity.transform.position = new Vector3(x, 0, 0);
      const renderer = entity.addComponent(MeshRenderer);
      renderer.mesh = mesh;
      renderer.setMaterial(material);
      const element = { component: renderer, material } as Parameters<MeshRenderer["_canBatch"]>[0];
      expect(renderer._canBatch(element, element)).toBe(false);
    }
    const draw = vi.spyOn(gl, "drawElements");
    camera.render();
    expect(draw).toHaveBeenCalledTimes(2);
  } finally {
    engine.destroy();
  }
});
