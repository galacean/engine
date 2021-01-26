import { WebCanvas } from "../src/WebCanvas"
import { WebGLEngine } from "../src/WebGLEngine"

describe("webgl engine test", () => {
  it("create a webgl engine", () => {
    const canvas = document.createElement("canvas");
    const engine = new WebGLEngine(canvas);
    expect(engine.canvas instanceof WebCanvas).toBeTruthy();
  });
});
