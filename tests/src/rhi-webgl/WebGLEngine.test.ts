import { expect } from "chai";
import { WebGLEngine, WebCanvas } from "@oasis-engine/rhi-webgl";

describe("webgl engine test", () => {
  it("create a webgl engine", () => {
    const canvas = document.createElement("canvas");
    const engine = new WebGLEngine(canvas);
    expect(engine).not.be.null;
  });
});