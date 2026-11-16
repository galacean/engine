import { ParticleRenderer } from "../../../../../../galacean/dist/module.js";
import { expect, it } from "vitest";
import { createEngine } from "../../../../helpers/createEngine";

it("does not request transform feedback when orbital velocity is active", async () => {
  const { engine } = await createEngine();
  try {
    const particle = engine.sceneManager.activeScene!.createRootEntity().addComponent(ParticleRenderer).generator;
    const velocity = particle.velocityOverLifetime;
    velocity.enabled = true;
    velocity.orbitalX.constant = 1;
    expect(velocity._isOrbitalActive()).toBe(true);
    expect(velocity._needTransformFeedback()).toBe(false);
    expect(particle._feedbackSimulator).toBeNull();
  } finally {
    engine.destroy();
  }
});
