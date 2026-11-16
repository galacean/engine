import { ParticleRenderer } from "../../../../../../galacean/dist/module.js";
import { expect, it } from "vitest";
import { createEngine } from "../../../../helpers/createEngine";

it("keeps noise disabled when enabled on WebGL1", async () => {
  const { engine } = await createEngine();
  try {
    const particle = engine.sceneManager.activeScene!.createRootEntity().addComponent(ParticleRenderer).generator;
    particle.noise.enabled = true;
    expect(particle.noise.enabled).toBe(false);
    expect(particle._feedbackSimulator).toBeNull();
  } finally {
    engine.destroy();
  }
});
