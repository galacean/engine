import { decodeText } from "./Util";

/**
 * Parse the glb format.
 * @param glb - Binary data
 * @returns GlTF information and bin information in Object glb.
 * @private
 */
export function parseGLB(glb) {
  const UINT32_LENGTH = 4;
  const GLB_HEADER_MAGIC = 0x46546c67; // 'glTF'
  const GLB_HEADER_LENGTH = 12;
  const GLB_CHUNK_TYPES = { JSON: 0x4e4f534a, BIN: 0x004e4942 };

  const dataView = new DataView(glb);

  // read header
  const header = {
    magic: dataView.getUint32(0, true),
    version: dataView.getUint32(UINT32_LENGTH, true),
    length: dataView.getUint32(2 * UINT32_LENGTH, true)
  };

  if (header.magic !== GLB_HEADER_MAGIC) {
    console.error("Invalid glb magic number. Expected 0x46546C67, found 0x" + header.magic.toString(16));
    return null;
  }

  // read main data
  let chunkLength = dataView.getUint32(GLB_HEADER_LENGTH, true);
  let chunkType = dataView.getUint32(GLB_HEADER_LENGTH + UINT32_LENGTH, true);

  // read glTF json
  if (chunkType !== GLB_CHUNK_TYPES.JSON) {
    console.error("Invalid glb chunk type. Expected 0x004E4942, found 0x" + chunkType.toString(16));
    return null;
  }

  const glTFData = new Uint8Array(glb, GLB_HEADER_LENGTH + 2 * UINT32_LENGTH, chunkLength);
  const gltf = JSON.parse(decodeText(glTFData));

  // read all buffers
  const buffers = [];
  let byteOffset = GLB_HEADER_LENGTH + 2 * UINT32_LENGTH + chunkLength;

  while (byteOffset < header.length) {
    chunkLength = dataView.getUint32(byteOffset, true);
    chunkType = dataView.getUint32(byteOffset + UINT32_LENGTH, true);

    if (chunkType !== GLB_CHUNK_TYPES.BIN) {
      console.error("Invalid glb chunk type. Expected 0x004E4942, found 0x" + chunkType.toString(16));
      return null;
    }

    const currentOffset = byteOffset + 2 * UINT32_LENGTH;
    const buffer = glb.slice(currentOffset, currentOffset + chunkLength);
    buffers.push(buffer);

    byteOffset += chunkLength + 2 * UINT32_LENGTH;
  }

  // start parse glTF
  return {
    gltf,
    buffers
  };
}
