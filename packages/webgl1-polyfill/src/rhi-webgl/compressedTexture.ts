import { callOriginal } from "@/override";

const filled = new WeakMap<object, number[]>();
/** Allocate a compressed mip once, then use the original sub-image path. */
export function setCompressedPixels(texture: any, cube: boolean, args: any[]): void {
  if (!texture._formatDetail.isCompressed) return callOriginal(texture, ...args);
  const [face, data, level = 0, x, y, width, height] = cube ? args : [0, ...args];
  let faces = filled.get(texture);
  if (!faces) filled.set(texture, (faces = new Array(6).fill(0)));
  const bit = 1 << level;
  if (faces[face] & bit) return callOriginal(texture, ...args);
  texture._bind();
  const gl = texture._gl;
  gl.compressedTexImage2D(
    cube ? gl.TEXTURE_CUBE_MAP_POSITIVE_X + face : texture._target,
    level,
    texture._formatDetail.internalFormat,
    width || Math.max(1, texture._texture.width >> level) - x,
    height || Math.max(1, texture._texture.height >> level) - y,
    0,
    data
  );
  faces[face] |= bit;
}
