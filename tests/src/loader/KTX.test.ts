import { TextureFormat } from "@galacean/engine-core";
import { GLCompressedTextureInternalFormat } from "@galacean/engine-rhi-webgl";
import { describe, expect, it } from "vitest";
import { parseCubeKTX, parseSingleKTX } from "../../../packages/loader/src/compressed-texture";

function createKTX(seed: number): ArrayBuffer {
  const buffer = new ArrayBuffer(100);
  const bytes = new Uint8Array(buffer);
  bytes.set([0xab, 0x4b, 0x54, 0x58, 0x20, 0x31, 0x31, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a]);
  new Uint32Array(buffer, 12, 13).set([
    0x04030201,
    0,
    1,
    0,
    GLCompressedTextureInternalFormat.RGB_S3TC_DXT1_EXT,
    0x1907,
    4,
    4,
    0,
    0,
    1,
    3,
    0
  ]);
  const view = new DataView(buffer);
  for (let level = 0; level < 3; level++) {
    const offset = 64 + level * 12;
    view.setUint32(offset, 8, true);
    bytes.fill(seed + level, offset + 4, offset + 12);
  }
  return buffer;
}

describe("KTX texture data", () => {
  it("returns a mapped format and the complete mip chain", () => {
    const texture = parseSingleKTX(createKTX(10));
    expect(texture).toMatchObject({
      width: 4,
      height: 4,
      engineFormat: TextureFormat.BC1,
      internalFormat: GLCompressedTextureInternalFormat.RGB_S3TC_DXT1_EXT
    });
    expect(texture.mipmaps.map(({ width, height }) => [width, height])).toEqual([
      [4, 4],
      [2, 2],
      [1, 1]
    ]);
    expect(
      texture.mipmaps.map(({ data }) => Array.from(new Uint8Array(data.buffer, data.byteOffset, data.byteLength)))
    ).toEqual([Array(8).fill(10), Array(8).fill(11), Array(8).fill(12)]);
  });

  it("preserves the face order and mip data of a cube texture", () => {
    const texture = parseCubeKTX(Array.from({ length: 6 }, (_, face) => createKTX(face * 10)));
    expect(texture).toMatchObject({ width: 4, height: 4, engineFormat: TextureFormat.BC1 });
    expect(texture.mipmapsFaces).toHaveLength(6);
    for (let face = 0; face < 6; face++) {
      const mipmaps = texture.mipmapsFaces[face];
      expect(mipmaps).toHaveLength(3);
      expect(mipmaps.map(({ data }) => new Uint8Array(data.buffer, data.byteOffset, data.byteLength)[0])).toEqual([
        face * 10,
        face * 10 + 1,
        face * 10 + 2
      ]);
      expect(mipmaps[2]).toMatchObject({ width: 1, height: 1 });
    }
  });

  it("rejects invalid headers and unsupported formats instead of returning incomplete data", () => {
    expect(() => parseSingleKTX(new ArrayBuffer(12))).toThrow("missing KTX identifier");
    const unsupported = createKTX(0);
    new DataView(unsupported).setUint32(28, 0, true);
    expect(() => parseSingleKTX(unsupported)).toThrow("format is not supported");
  });
});
