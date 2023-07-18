/**
 *
 * ported from https://github.com/BabylonJS/Babylon.js/blob/master/src/Tools/babylon.khronosTextureContainer.ts
 */

import { TextureFormat } from "@galacean/engine-core";
import { GLCompressedTextureInternalFormat } from "@galacean/engine-rhi-webgl";
import { KTXContainer, Mipmap } from "./type";

const HEADER_LEN = 12 + 13 * 4; // identifier + header elements (not including key value meta-data pairs)

// load types
const COMPRESSED_2D = 0; // uses a gl.compressedTexImage2D()
const COMPRESSED_3D = 1; // uses a gl.compressedTexImage3D()
const TEX_2D = 2; // uses a gl.texImage2D()
const TEX_3D = 3; // uses a gl.texImage3D()

function getMipmaps(ktxContainer: KTXContainer, loadMipmaps: boolean): Mipmap[] {
  const mipmaps = [];

  // initialize width & height for level 1
  var dataOffset = HEADER_LEN + ktxContainer.bytesOfKeyValueData;
  var width = ktxContainer.pixelWidth;
  var height = ktxContainer.pixelHeight;
  var mipmapCount = loadMipmaps ? ktxContainer.numberOfMipmapLevels : 1;

  for (var level = 0; level < mipmapCount; level++) {
    var imageSize = new Int32Array(ktxContainer.buffer, dataOffset, 1)[0]; // size per face, since not supporting array cubemaps
    dataOffset += 4; // size of the image + 4 for the imageSize field

    for (var face = 0; face < ktxContainer.numberOfFaces; face++) {
      var byteArray = new Uint8Array(ktxContainer.buffer, dataOffset, imageSize);

      mipmaps.push({ data: byteArray, width: width, height: height });

      dataOffset += imageSize;
      dataOffset += 3 - ((imageSize + 3) % 4); // add padding for odd sized image
    }
    width = Math.max(1.0, width * 0.5);
    height = Math.max(1.0, height * 0.5);
  }

  return mipmaps;
}

/**
 * Checks if the given data starts with a KTX file identifier.
 * @param data the data to check
 * @returns true if the data is a KTX file or false otherwise
 */
function isValid(data: ArrayBuffer): boolean {
  if (data.byteLength >= 12) {
    // '«', 'K', 'T', 'X', ' ', '1', '1', '»', '\r', '\n', '\x1A', '\n'
    const identifier = new Uint8Array(data, 0, 12);
    if (
      identifier[0] === 0xab &&
      identifier[1] === 0x4b &&
      identifier[2] === 0x54 &&
      identifier[3] === 0x58 &&
      identifier[4] === 0x20 &&
      identifier[5] === 0x31 &&
      identifier[6] === 0x31 &&
      identifier[7] === 0xbb &&
      identifier[8] === 0x0d &&
      identifier[9] === 0x0a &&
      identifier[10] === 0x1a &&
      identifier[11] === 0x0a
    ) {
      return true;
    }
  }

  return false;
}

function getEngineFormat(internalFormat: GLint): TextureFormat {
  switch (internalFormat) {
    // case GLCompressedTextureInternalFormat.RGBA_S3TC_DXT3_EXT:
    // case GLCompressedTextureInternalFormat.RGBA_S3TC_DXT5_EXT:
    // break;
    case GLCompressedTextureInternalFormat.RGB_S3TC_DXT1_EXT:
      return TextureFormat.BC1;
    case GLCompressedTextureInternalFormat.RGBA_S3TC_DXT5_EXT:
      return TextureFormat.BC3;
    case GLCompressedTextureInternalFormat.RGBA_BPTC_UNORM_EXT:
      return TextureFormat.BC7;
    case GLCompressedTextureInternalFormat.RGB_ETC1_WEBGL:
      return TextureFormat.ETC1_RGB;
    case GLCompressedTextureInternalFormat.RGB8_ETC2:
      return TextureFormat.ETC2_RGB;
    case GLCompressedTextureInternalFormat.RGB8_PUNCHTHROUGH_ALPHA1_ETC2:
      return TextureFormat.ETC2_RGBA5;
    case GLCompressedTextureInternalFormat.RGBA8_ETC2_EAC:
      return TextureFormat.ETC2_RGBA8;
    case GLCompressedTextureInternalFormat.RGB_PVRTC_2BPPV1_IMG:
      return TextureFormat.PVRTC_RGB2;
    case GLCompressedTextureInternalFormat.RGBA_PVRTC_2BPPV1_IMG:
      return TextureFormat.PVRTC_RGBA2;
    case GLCompressedTextureInternalFormat.RGB_PVRTC_4BPPV1_IMG:
      return TextureFormat.PVRTC_RGB4;
    case GLCompressedTextureInternalFormat.RGBA_PVRTC_4BPPV1_IMG:
      return TextureFormat.PVRTC_RGBA4;
    case GLCompressedTextureInternalFormat.RGBA_ASTC_4X4_KHR:
      return TextureFormat.ASTC_4x4;
    case GLCompressedTextureInternalFormat.RGBA_ASTC_5X5_KHR:
      return TextureFormat.ASTC_5x5;
    case GLCompressedTextureInternalFormat.RGBA_ASTC_6X6_KHR:
      return TextureFormat.ASTC_6x6;
    case GLCompressedTextureInternalFormat.RGBA_ASTC_8X8_KHR:
      return TextureFormat.ASTC_8x8;
    case GLCompressedTextureInternalFormat.RGBA_ASTC_10X10_KHR:
      return TextureFormat.ASTC_10x10;
    case GLCompressedTextureInternalFormat.RGBA_ASTC_12X12_KHR:
      return TextureFormat.ASTC_12x12;
    default:
      const formatName: any = GLCompressedTextureInternalFormat[internalFormat];
      throw new Error(`this format is not supported in Galacean Engine: ${formatName}`);
  }
}
/**
 * for description see https://www.khronos.org/opengles/sdk/tools/KTX/
 * for file layout see https://www.khronos.org/opengles/sdk/tools/KTX/file_format_spec/
 */
export const khronosTextureContainerParser = {
  /**
   *
   * @param buffer contents of the KTX container file
   * @param facesExpected should be either 1 or 6, based whether a cube texture or or
   * @param threeDExpected provision for indicating that data should be a 3D texture, not implemented
   * @param textureArrayExpected provision for indicating that data should be a texture array, not implemented
   * @param mapEngineFormat get Galacean Engine native TextureFormat?
   */
  parse(
    buffer: ArrayBuffer,
    facesExpected: number,
    withMipmaps: boolean,
    mapEngineFormat: boolean = false
  ): KTXContainer {
    if (!isValid(buffer)) {
      throw new Error("khronosTextureContainerParser: invalid KTX file, texture missing KTX identifier");
    }

    // load the reset of the header in native 32 bit uint
    const dataSize = Uint32Array.BYTES_PER_ELEMENT;
    const headerDataView = new DataView(buffer, 12, 13 * dataSize);
    const endianness = headerDataView.getUint32(0, true);
    const littleEndian = endianness === 0x04030201;

    const parsedResult: KTXContainer = {
      buffer: buffer,
      glType: headerDataView.getUint32(1 * dataSize, littleEndian), // must be 0 for compressed textures
      glTypeSize: headerDataView.getUint32(2 * dataSize, littleEndian), // must be 1 for compressed textures
      glFormat: headerDataView.getUint32(3 * dataSize, littleEndian), // must be 0 for compressed textures
      glInternalFormat: headerDataView.getUint32(4 * dataSize, littleEndian), // the value of arg passed to gl.compressedTexImage2D(,,x,,,,)
      glBaseInternalFormat: headerDataView.getUint32(5 * dataSize, littleEndian), // specify GL_RGB, GL_RGBA, GL_ALPHA, etc (un-compressed only)
      pixelWidth: headerDataView.getUint32(6 * dataSize, littleEndian), // level 0 value of arg passed to gl.compressedTexImage2D(,,,x,,,)
      pixelHeight: headerDataView.getUint32(7 * dataSize, littleEndian), // level 0 value of arg passed to gl.compressedTexImage2D(,,,,x,,)
      pixelDepth: headerDataView.getUint32(8 * dataSize, littleEndian), // level 0 value of arg passed to gl.compressedTexImage3D(,,,,,x,,)
      numberOfArrayElements: headerDataView.getUint32(9 * dataSize, littleEndian), // used for texture arrays
      numberOfFaces: headerDataView.getUint32(10 * dataSize, littleEndian), // used for cubemap textures, should either be 1 or 6
      numberOfMipmapLevels: headerDataView.getUint32(11 * dataSize, littleEndian), // number of levels; disregard possibility of 0 for compressed textures
      bytesOfKeyValueData: headerDataView.getUint32(12 * dataSize, littleEndian), // the amount of space after the header for meta-data
      // would need to make this more elaborate & adjust checks above to support more than one load type
      loadType: COMPRESSED_2D
    };

    // Make sure we have a compressed type.  Not only reduces work, but probably better to let dev know they are not compressing.
    if (parsedResult.glType !== 0) {
      throw new Error("only compressed formats currently supported");
    } else {
      // value of zero is an indication to generate mipmaps @ runtime.  Not usually allowed for compressed, so disregard.
      parsedResult.numberOfMipmapLevels = Math.max(1, parsedResult.numberOfMipmapLevels);
    }

    if (parsedResult.pixelHeight === 0 || parsedResult.pixelDepth !== 0) {
      throw new Error("only 2D textures currently supported");
    }

    if (parsedResult.numberOfArrayElements !== 0) {
      throw new Error("texture arrays not currently supported");
    }

    if (parsedResult.numberOfFaces !== facesExpected) {
      throw new Error("number of faces expected" + facesExpected + ", but found " + parsedResult.numberOfFaces);
    }

    if (withMipmaps) {
      parsedResult.mipmaps = getMipmaps(parsedResult, true);
    }

    if (mapEngineFormat) {
      parsedResult.engineFormat = getEngineFormat(parsedResult.glInternalFormat);
    }
    return parsedResult;
  }
};
