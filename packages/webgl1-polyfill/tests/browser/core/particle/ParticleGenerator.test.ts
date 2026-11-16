import { ParticleRenderer } from "../../../../../galacean/dist/module.js";
import { expect, it, vi } from "vitest";
import { createEngine } from "../../../helpers/createEngine";

it("does not create a simulator even when a module requests transform feedback", async () => {
  const { engine } = await createEngine();
  try {
    const scene = engine.sceneManager.activeScene!;
    const renderer = scene.createRootEntity().addComponent(ParticleRenderer);
    const generator = renderer.generator;
    // Isolate the generator guard from the NoiseModule setter, which already rejects enable.
    const noise = vi.spyOn(generator.noise, "enabled", "get").mockReturnValue(true);
    expect(() => generator._setTransformFeedback()).not.toThrow();
    expect(generator._feedbackSimulator).toBeNull();
    noise.mockRestore();
  } finally {
    engine.destroy();
  }
});
