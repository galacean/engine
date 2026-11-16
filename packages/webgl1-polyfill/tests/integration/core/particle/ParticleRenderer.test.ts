import { ParticleRenderer, Renderer } from "../../../../../galacean/dist/module.js";
import { expect, it, vi } from "vitest";
import { createEngine } from "../../../helpers/createEngine";

it("skips particle registration and render preparation without instancing", async () => {
  const { engine } = await createEngine(["ANGLE_instanced_arrays"]);
  try {
    const basePrepare = vi.spyOn(Renderer.prototype, "_prepareRender");
    try {
      const scene = engine.sceneManager.activeScene!;
      const particle = scene.createRootEntity().addComponent(ParticleRenderer);
      expect(particle._particleSystemManager).toBeNull();
      particle._prepareRender({} as Parameters<ParticleRenderer["_prepareRender"]>[0]);
      expect(basePrepare).not.toHaveBeenCalled();
    } finally {
      basePrepare.mockRestore();
    }
  } finally {
    engine.destroy();
  }
});
