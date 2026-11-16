import {
  Camera,
  FontAtlas,
  GLTexture,
  GLTexture2D,
  ShaderPass,
  WebGLGraphicDevice
} from "../../../galacean/dist/module.js";
import { expect, it } from "vitest";
import { createEngine } from "../helpers/createEngine";

it("registers core and RHI mixins when the published entry point is loaded", async () => {
  const readMethods = () => [
    FontAtlas.prototype["_createTexture"],
    Camera.prototype["_getHDRColorTextureFormat"],
    ShaderPass.prototype["_compileShaderSource"],
    GLTexture.prototype["_allocateCompressedMip"],
    WebGLGraphicDevice.prototype.createPlatformTransformFeedback
  ];
  const originalMethods = readMethods();
  const render = Camera.prototype.render;
  const upload = GLTexture2D.prototype.setPixelBuffer;
  const { engine } = await createEngine();
  try {
    readMethods().forEach((method, index) => expect(method).not.toBe(originalMethods[index]));
    expect(Camera.prototype.render).toBe(render);
    expect(GLTexture2D.prototype.setPixelBuffer).toBe(upload);
  } finally {
    engine.destroy();
  }
});
