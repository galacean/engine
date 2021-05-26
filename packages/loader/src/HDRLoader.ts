import {
  AssetPromise,
  AssetType,
  Loader,
  LoadItem,
  resourceLoader,
  ResourceManager,
  TextureCubeFace,
  TextureCubeMap,
  TextureFilterMode,
  TextureFormat
} from "@oasis-engine/core";
import { Color, Vector3 } from "@oasis-engine/math";

interface IHDRHeader {
  /**
   * The width of the texture in pixels.
   */
  width: number;
  /**
   * The height of the texture in pixels.
   */
  height: number;
  /**
   * The index of the beginning of the data in the binary file.
   */
  dataPosition: number;
}

/**
 * Helper class useful to convert panorama picture to their cubemap representation in 6 faces.
 */
class PanoramaToCubeMapTools {
  static CUBE_SIZE = 256;

  private static _FACE_FRONT = [
    new Vector3(-1.0, -1.0, -1.0),
    new Vector3(1.0, -1.0, -1.0),
    new Vector3(-1.0, 1.0, -1.0),
    new Vector3(1.0, 1.0, -1.0)
  ];
  private static _FACE_BACK = [
    new Vector3(1.0, -1.0, 1.0),
    new Vector3(-1.0, -1.0, 1.0),
    new Vector3(1.0, 1.0, 1.0),
    new Vector3(-1.0, 1.0, 1.0)
  ];
  private static _FACE_RIGHT = [
    new Vector3(1.0, -1.0, -1.0),
    new Vector3(1.0, -1.0, 1.0),
    new Vector3(1.0, 1.0, -1.0),
    new Vector3(1.0, 1.0, 1.0)
  ];
  private static _FACE_LEFT = [
    new Vector3(-1.0, -1.0, 1.0),
    new Vector3(-1.0, -1.0, -1.0),
    new Vector3(-1.0, 1.0, 1.0),
    new Vector3(-1.0, 1.0, -1.0)
  ];
  private static _FACE_DOWN = [
    new Vector3(-1.0, 1.0, -1.0),
    new Vector3(1.0, 1.0, -1.0),
    new Vector3(-1.0, 1.0, 1.0),
    new Vector3(1.0, 1.0, 1.0)
  ];
  private static _FACE_UP = [
    new Vector3(-1.0, -1.0, 1.0),
    new Vector3(1.0, -1.0, 1.0),
    new Vector3(-1.0, -1.0, -1.0),
    new Vector3(1.0, -1.0, -1.0)
  ];

  private static _tempVector3 = new Vector3();
  private static _temp2Vector3 = new Vector3();
  private static _temp3Vector3 = new Vector3();
  private static _temp4Vector3 = new Vector3();
  private static _temp5Vector3 = new Vector3();

  /**
   * Converts a panorma stored in RGB right to left up to down format into a cubemap (6 faces).
   *
   * @param pixels The source data.
   * @param inputWidth The width of the input panorama.
   * @param inputHeight The height of the input panorama.
   * @param size The willing size of the generated cubemap (each faces will be size * size pixels)
   * @return The cubemap data
   */
  static convertPanoramaToCubemap(
    float32Array: Float32Array,
    inputWidth: number,
    inputHeight: number,
    size: number
  ): Float32Array[] {
    if (!float32Array) {
      throw "ConvertPanoramaToCubemap: input cannot be null";
    }

    if (float32Array.length != inputWidth * inputHeight * 4) {
      throw "ConvertPanoramaToCubemap: input size is wrong";
    }

    const textureFront = this._createCubemapTexture(size, this._FACE_FRONT, float32Array, inputWidth, inputHeight);
    const textureBack = this._createCubemapTexture(size, this._FACE_BACK, float32Array, inputWidth, inputHeight);
    const textureLeft = this._createCubemapTexture(size, this._FACE_LEFT, float32Array, inputWidth, inputHeight);
    const textureRight = this._createCubemapTexture(size, this._FACE_RIGHT, float32Array, inputWidth, inputHeight);
    const textureUp = this._createCubemapTexture(size, this._FACE_UP, float32Array, inputWidth, inputHeight);
    const textureDown = this._createCubemapTexture(size, this._FACE_DOWN, float32Array, inputWidth, inputHeight);

    return [textureRight, textureLeft, textureUp, textureDown, textureFront, textureBack];
  }

  private static _createCubemapTexture(
    texSize: number,
    faceData: Vector3[],
    float32Array: Float32Array,
    inputWidth: number,
    inputHeight: number
  ) {
    var buffer = new ArrayBuffer(texSize * texSize * 4 * 4);
    var textureArray = new Float32Array(buffer);

    const rotDX1 = this._tempVector3
      .setValue(0, 0, 0)
      .add(faceData[1])
      .subtract(faceData[0])
      .scale(1 / texSize);
    const rotDX2 = this._temp2Vector3
      .setValue(0, 0, 0)
      .add(faceData[3])
      .subtract(faceData[2])
      .scale(1 / texSize);

    var dy = 1 / texSize;
    var fy = 0;

    for (var y = 0; y < texSize; y++) {
      let xv1 = this._temp3Vector3.setValue(0, 0, 0).add(faceData[0]);
      let xv2 = this._temp4Vector3.setValue(0, 0, 0).add(faceData[2]);

      for (var x = 0; x < texSize; x++) {
        const v = this._temp5Vector3.setValue(0, 0, 0).add(xv2).subtract(xv1).scale(fy).add(xv1);
        v.normalize();

        var color = this._calcProjectionSpherical(v, float32Array, inputWidth, inputHeight);

        // 3 channels per pixels
        textureArray[y * texSize * 4 + x * 4 + 0] = color.r;
        textureArray[y * texSize * 4 + x * 4 + 1] = color.g;
        textureArray[y * texSize * 4 + x * 4 + 2] = color.b;
        textureArray[y * texSize * 4 + x * 4 + 3] = color.a;

        xv1 = xv1.add(rotDX1);
        xv2 = xv2.add(rotDX2);
      }

      fy += dy;
    }

    return textureArray;
  }

  private static _calcProjectionSpherical(
    vDir: Vector3,
    float32Array: Float32Array,
    inputWidth: number,
    inputHeight: number
  ): Color {
    var theta = Math.atan2(vDir.z, vDir.x);
    var phi = Math.acos(vDir.y);

    while (theta < -Math.PI) {
      theta += 2 * Math.PI;
    }
    while (theta > Math.PI) {
      theta -= 2 * Math.PI;
    }

    var dx = theta / Math.PI;
    var dy = phi / Math.PI;

    // recenter.
    dx = dx * 0.5 + 0.5;

    var px = Math.round(dx * inputWidth);
    if (px < 0) {
      px = 0;
    } else if (px >= inputWidth) {
      px = inputWidth - 1;
    }

    var py = Math.round(dy * inputHeight);
    if (py < 0) {
      py = 0;
    } else if (py >= inputHeight) {
      py = inputHeight - 1;
    }

    var inputY = inputHeight - py - 1;
    var r = float32Array[inputY * inputWidth * 4 + px * 4 + 0];
    var g = float32Array[inputY * inputWidth * 4 + px * 4 + 1];
    var b = float32Array[inputY * inputWidth * 4 + px * 4 + 2];

    return new Color(r, g, b, 1);
  }
}

@resourceLoader(AssetType.HDR, ["hdr"])
class HDRLoader extends Loader<TextureCubeMap> {
  private static _readStringLine(uint8array: Uint8Array, startIndex: number): string {
    let line = "";
    let character = "";

    for (let i = startIndex; i < uint8array.length - startIndex; i++) {
      character = String.fromCharCode(uint8array[i]);

      if (character == "\n") {
        break;
      }

      line += character;
    }

    return line;
  }

  private static _parseHeader(uint8array: Uint8Array): IHDRHeader {
    let height: number = 0;
    let width: number = 0;

    let line = this._readStringLine(uint8array, 0);
    if (line[0] != "#" || line[1] != "?") {
      throw "Bad HDR Format.";
    }

    let endOfHeader = false;
    let findFormat = false;
    let lineIndex: number = 0;

    do {
      lineIndex += line.length + 1;
      line = this._readStringLine(uint8array, lineIndex);

      if (line == "FORMAT=32-bit_rle_rgbe") {
        findFormat = true;
      } else if (line.length == 0) {
        endOfHeader = true;
      }
    } while (!endOfHeader);

    if (!findFormat) {
      throw "HDR Bad header format, unsupported FORMAT";
    }

    lineIndex += line.length + 1;
    line = this._readStringLine(uint8array, lineIndex);

    const sizeRegexp = /^\-Y (.*) \+X (.*)$/g;
    const match = sizeRegexp.exec(line);

    // TODO. Support +Y and -X if needed.
    if (!match || match.length < 3) {
      throw "HDR Bad header format, no size";
    }
    width = parseInt(match[2]);
    height = parseInt(match[1]);

    if (width < 8 || width > 0x7fff) {
      throw "HDR Bad header format, unsupported size";
    }

    lineIndex += line.length + 1;

    return {
      height: height,
      width: width,
      dataPosition: lineIndex
    };
  }

  private static _readPixels(uint8array: Uint8Array, width: number, height: number): Float32Array {
    let num_scanlines = height;
    let scanline_width = width;

    let a: number, b: number, c: number, d: number, count: number;
    let dataIndex = 0;
    let index = 0,
      endIndex = 0,
      i = 0;

    let scanLineArrayBuffer = new ArrayBuffer(scanline_width * 4); // four channel R G B E
    let scanLineArray = new Uint8Array(scanLineArrayBuffer);

    // 3 channels of 4 bytes per pixel in float.
    let resultBuffer = new ArrayBuffer(width * height * 4 * 4);
    let resultArray = new Float32Array(resultBuffer);

    // read in each successive scanline
    while (num_scanlines > 0) {
      a = uint8array[dataIndex++];
      b = uint8array[dataIndex++];
      c = uint8array[dataIndex++];
      d = uint8array[dataIndex++];

      if (a != 2 || b != 2 || c & 0x80) {
        // this file is not run length encoded
        throw "HDR Bad header format, not RLE";
      }

      if (((c << 8) | d) != scanline_width) {
        throw "HDR Bad header format, wrong scan line width";
      }

      index = 0;

      // read each of the four channels for the scanline into the buffer
      for (i = 0; i < 4; i++) {
        endIndex = (i + 1) * scanline_width;

        while (index < endIndex) {
          a = uint8array[dataIndex++];
          b = uint8array[dataIndex++];

          if (a > 128) {
            // a run of the same value
            count = a - 128;
            if (count == 0 || count > endIndex - index) {
              throw "HDR Bad Format, bad scanline data (run)";
            }

            while (count-- > 0) {
              scanLineArray[index++] = b;
            }
          } else {
            // a non-run
            count = a;
            if (count == 0 || count > endIndex - index) {
              throw "HDR Bad Format, bad scanline data (non-run)";
            }

            scanLineArray[index++] = b;
            if (--count > 0) {
              for (let j = 0; j < count; j++) {
                scanLineArray[index++] = uint8array[dataIndex++];
              }
            }
          }
        }
      }

      // now convert data from buffer into floats
      for (i = 0; i < scanline_width; i++) {
        a = scanLineArray[i];
        b = scanLineArray[i + scanline_width];
        c = scanLineArray[i + 2 * scanline_width];
        d = scanLineArray[i + 3 * scanline_width];

        this.Rgbe2float(resultArray, a, b, c, d, (height - num_scanlines) * scanline_width * 4 + i * 4);
      }

      num_scanlines--;
    }

    return resultArray;
  }

  private static Rgbe2float(
    float32array: Float32Array,
    red: number,
    green: number,
    blue: number,
    exponent: number,
    index: number
  ) {
    if (exponent > 0) {
      /*nonzero pixel*/
      exponent = this.Ldexp(1.0, exponent - 128) / 255;
      float32array[index + 0] = red * exponent;
      float32array[index + 1] = green * exponent;
      float32array[index + 2] = blue * exponent;
      float32array[index + 3] = 1;
    } else {
      float32array[index + 0] = 0;
      float32array[index + 1] = 0;
      float32array[index + 2] = 0;
      float32array[index + 3] = 1;
    }
  }

  private static Ldexp(mantissa: number, exponent: number): number {
    if (exponent > 1023) {
      return mantissa * Math.pow(2, 1023) * Math.pow(2, exponent - 1023);
    }

    if (exponent < -1074) {
      return mantissa * Math.pow(2, -1074) * Math.pow(2, exponent + 1074);
    }

    return mantissa * Math.pow(2, exponent);
  }

  load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<TextureCubeMap> {
    return new AssetPromise((resolve, reject) => {
      resourceManager
        .load<ArrayBuffer>({
          url: item.url,
          type: AssetType.Buffer
        })
        .then((buffer) => {
          const uint8Array = new Uint8Array(buffer);
          const info = HDRLoader._parseHeader(uint8Array);
          const { width, height, dataPosition } = info;
          const pixels = HDRLoader._readPixels(uint8Array.subarray(dataPosition), width, height);
          const size = PanoramaToCubeMapTools.CUBE_SIZE;
          const cubeMapData = PanoramaToCubeMapTools.convertPanoramaToCubemap(pixels, width, height, size);
          console.log(cubeMapData, width, height);

          const texture = new TextureCubeMap(resourceManager.engine, size, TextureFormat.R32G32B32A32);
          for (let faceIndex = 0; faceIndex < 6; faceIndex++) {
            texture.setPixelBuffer(TextureCubeFace.PositiveX + faceIndex, cubeMapData[faceIndex], 0);
          }
          texture.generateMipmaps();
          resolve(texture);
        })
        .catch(reject);
    });
  }
}
