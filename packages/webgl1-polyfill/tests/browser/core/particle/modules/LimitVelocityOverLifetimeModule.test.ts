import { ParticleRenderer } from "../../../../../../galacean/dist/module.js";
import { expect, it } from "vitest";
import { createEngine } from "../../../../helpers/createEngine";

it("keeps limitVelocityOverLifetime disabled when enabled on WebGL1", async () => {
  const { engine } = await createEngine();
  try {
    const particle = engine.sceneManager.activeScene!.createRootEntity().addComponent(ParticleRenderer).generator;
    particle.limitVelocityOverLifetime.enabled = true;
    expect(particle.limitVelocityOverLifetime.enabled).toBe(false);
    expect(particle._feedbackSimulator).toBeNull();
  } finally {
    engine.destroy();
  }
});
