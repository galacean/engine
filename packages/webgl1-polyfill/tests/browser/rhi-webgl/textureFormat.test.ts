import { TextureFormat } from "../../../../galacean/dist/module.js";
import { expect, it } from "vitest";
import { textureFormat } from "../../../src/rhi-webgl/textureFormat";
import { createWebGL1Canvas } from "../../helpers/canvas";

it("maps color texture and depth renderbuffer formats to WebGL1 enums", () => {
  const gl = createWebGL1Canvas().getContext("webgl")!;
  expect(textureFormat(TextureFormat.R8G8B8A8, false, gl, TextureFormat)).toMatchObject({
    internalFormat: gl.RGBA,
    baseFormat: gl.RGBA,
    dataType: gl.UNSIGNED_BYTE
  });
  expect(textureFormat(TextureFormat.Depth, false, gl, TextureFormat, true)).toMatchObject({
    internalFormat: gl.DEPTH_COMPONENT16,
    attachment: gl.DEPTH_ATTACHMENT
  });
});
