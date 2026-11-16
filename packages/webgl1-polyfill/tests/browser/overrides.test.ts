import { Camera, FontAtlas, GLTexture2D, ShaderPass, WebGLGraphicDevice } from "../../../galacean/dist/module.js";
import { expect, it } from "vitest";
import { createEngine } from "../helpers/createEngine";

it("registers core and RHI mixins when the published entry point is loaded", async () => {
  const readMethods = () => [
    FontAtlas.prototype["_createTexture"],
    Camera.prototype.render,
    ShaderPass.prototype["_compileShaderSource"],
    GLTexture2D.prototype.setPixelBuffer,
    WebGLGraphicDevice.prototype.createPlatformTransformFeedback
  ];
  const originalMethods = readMethods();
  const { engine } = await createEngine();
  try {
    readMethods().forEach((method, index) => expect(method).not.toBe(originalMethods[index]));
  } finally {
    engine.destroy();
  }
});
