import { PhysicsMaterial, WebGLEngine } from "@galacean/engine";
import { expect, it } from "vitest";

it("can destroy an engine after material construction fails without a physics backend", async () => {
  const engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
  expect(() => new PhysicsMaterial(engine)).toThrow();
  expect(() => engine.destroy()).not.toThrow();
});
