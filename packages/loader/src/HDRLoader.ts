import {
  AssetPromise,
  AssetType,
  ContentRestorer,
  Engine,
  LoadItem,
  Loader,
  RequestConfig,
  ResourceManager,
  TextureCube,
  TextureCubeFace,
  resourceLoader
} from "@galacean/engine-core";
import { Color, Vector3 } from "@galacean/engine-math";

const PI = Math.PI;
const MIN_HDR_WIDTH = 8;
const MAX_HDR_WIDTH = 0x7fff;
const MAX_HDR_HEIGHT = 0x7fff;
const MAX_HDR_PIXELS = 33_554_432; // 8192 x 4096 max equirectangular HDR (128 MiB RGBE)
const MAX_HDR_CUBEMAP_BYTES = 128 * 1024 * 1024; // 6 faces x 2048 x 2048 x 4 = 96 MiB <= 128 MiB
const MAX_HDR_HEADER_BYTES = 65_536;
const MAX_HDR_LINE_LENGTH = 4096;
const HDR_SIZE_REGEX = /^-Y (\d+) \+X (\d+)\r?$/;

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

// referenece: https://www.flipcode.com/archives/HDR_Image_Reader.shtml
@resourceLoader(AssetType.HDR, ["hdr"])
class HDRLoader extends Loader<TextureCube> {
  private static _rightBottomBack = new Vector3(1.0, -1.0, -1.0);
  private static _rightBottomFront = new Vector3(1.0, -1.0, 1.0);
  private static _rightUpBack = new Vector3(1.0, 1.0, -1.0);
  private static _rightUpFront = new Vector3(1.0, 1.0, 1.0);
  private static _leftBottomBack = new Vector3(-1.0, -1.0, -1.0);
  private static _leftBottomFront = new Vector3(-1.0, -1.0, 1.0);
  private static _leftUpBack = new Vector3(-1.0, 1.0, -1.0);
  private static _leftUpFront = new Vector3(-1.0, 1.0, 1.0);

  private static _faceRight = [
    HDRLoader._rightBottomBack,
    HDRLoader._rightBottomFront,
    HDRLoader._rightUpBack,
    HDRLoader._rightUpFront
  ];
  private static _faceLeft = [
    HDRLoader._leftBottomFront,
    HDRLoader._leftBottomBack,
    HDRLoader._leftUpFront,
    HDRLoader._leftUpBack
  ];
  private static _faceUp = [
    HDRLoader._leftBottomFront,
    HDRLoader._rightBottomFront,
    HDRLoader._leftBottomBack,
    HDRLoader._rightBottomBack
  ];
  private static _faceBottom = [
    HDRLoader._leftUpBack,
    HDRLoader._rightUpBack,
    HDRLoader._leftUpFront,
    HDRLoader._rightUpFront
  ];
  private static _faceFront = [
    HDRLoader._leftBottomBack,
    HDRLoader._rightBottomBack,
    HDRLoader._leftUpBack,
    HDRLoader._rightUpBack
  ];
  private static _faceBack = [
    HDRLoader._rightBottomFront,
    HDRLoader._leftBottomFront,
    HDRLoader._rightUpFront,
    HDRLoader._leftUpFront
  ];

  private static _tempVector3 = new Vector3();
  private static _temp2Vector3 = new Vector3();
  private static _temp3Vector3 = new Vector3();
  private static _temp4Vector3 = new Vector3();
  private static _temp5Vector3 = new Vector3();

  /**
   * @internal
   */
  static _setTextureByBuffer(engine: Engine, buffer: ArrayBuffer, texture?: TextureCube) {
    const bufferArray = new Uint8Array(buffer);
    const { width, height, dataPosition } = HDRLoader._parseHeader(bufferArray);
    const cubeSize = height >> 1;
    if (cubeSize < 1 || 6 * cubeSize * cubeSize * 4 > MAX_HDR_CUBEMAP_BYTES) {
      throw "HDR Bad header format, cubemap size exceeds limit";
    }
    const pixels = HDRLoader._readPixels(bufferArray.subarray(dataPosition), width, height);
    const cubeMapData = HDRLoader._convertToCubemap(pixels, width, height, cubeSize);
    texture ||= new TextureCube(engine, cubeSize, undefined, undefined, false);
    for (let faceIndex = 0; faceIndex < 6; faceIndex++) {
      texture.setPixelBuffer(TextureCubeFace.PositiveX + faceIndex, cubeMapData[faceIndex], 0);
    }
    texture.generateMipmaps();
    return texture;
  }

  private static _convertToCubemap(
    pixels: Uint8Array,
    inputWidth: number,
    inputHeight: number,
    size: number
  ): Uint8ClampedArray[] {
    if (!pixels) {
      throw "ConvertPanoramaToCubemap: input cannot be null";
    }

    if (pixels.length != inputWidth * inputHeight * 4) {
      throw "ConvertPanoramaToCubemap: input size is wrong";
    }

    const textureRight = this._createCubemapData(size, this._faceRight, pixels, inputWidth, inputHeight);
    const textureLeft = this._createCubemapData(size, this._faceLeft, pixels, inputWidth, inputHeight);
    const textureUp = this._createCubemapData(size, this._faceUp, pixels, inputWidth, inputHeight);
    const textureDown = this._createCubemapData(size, this._faceBottom, pixels, inputWidth, inputHeight);
    const textureFront = this._createCubemapData(size, this._faceFront, pixels, inputWidth, inputHeight);
    const textureBack = this._createCubemapData(size, this._faceBack, pixels, inputWidth, inputHeight);

    return [textureRight, textureLeft, textureUp, textureDown, textureFront, textureBack];
  }

  private static _createCubemapData(
    texSize: number,
    faceData: Vector3[],
    pixels: Uint8Array,
    inputWidth: number,
    inputHeight: number
  ): Uint8ClampedArray {
    const textureArray = new Uint8ClampedArray(texSize * texSize * 4);
    const rotDX1 = this._tempVector3
      .set(0, 0, 0)
      .add(faceData[1])
      .subtract(faceData[0])
      .scale(1 / texSize);
    const rotDX2 = this._temp2Vector3
      .set(0, 0, 0)
      .add(faceData[3])
      .subtract(faceData[2])
      .scale(1 / texSize);

    const dy = 1 / texSize;
    let fy = 0;

    for (let y = 0; y < texSize; y++) {
      let xv1 = this._temp3Vector3.set(0, 0, 0).add(faceData[0]);
      let xv2 = this._temp4Vector3.set(0, 0, 0).add(faceData[2]);

      for (let x = 0; x < texSize; x++) {
        const v = this._temp5Vector3.set(0, 0, 0).add(xv2).subtract(xv1).scale(fy).add(xv1);
        v.normalize();

        const color = this._calcProjectionSpherical(v, pixels, inputWidth, inputHeight);
        this._RGBEToLinear(color);
        this._linearToRGBM(color, 5);

        // 4 channels per pixels
        const index = y * texSize * 4 + x * 4;
        textureArray[index] = color.r;
        textureArray[index + 1] = color.g;
        textureArray[index + 2] = color.b;
        textureArray[index + 3] = color.a;

        xv1.add(rotDX1);
        xv2.add(rotDX2);
      }

      fy += dy;
    }

    return textureArray;
  }

  private static _calcProjectionSpherical(
    vDir: Vector3,
    pixels: Uint8Array,
    inputWidth: number,
    inputHeight: number
  ): Color {
    let theta = Math.atan2(vDir.z, vDir.x);
    let phi = Math.acos(vDir.y);

    while (theta < -PI) {
      theta += 2 * PI;
    }
    while (theta > PI) {
      theta -= 2 * PI;
    }

    let dx = theta / PI;
    let dy = phi / PI;

    // recenter.
    dx = dx * 0.5 + 0.5;

    let px = Math.round(dx * inputWidth);
    if (px < 0) {
      px = 0;
    } else if (px >= inputWidth) {
      px = inputWidth - 1;
    }

    let py = Math.round(dy * inputHeight);
    if (py < 0) {
      py = 0;
    } else if (py >= inputHeight) {
      py = inputHeight - 1;
    }

    const inputY = inputHeight - py - 1;
    const index = inputY * inputWidth * 4 + px * 4;
    const r = pixels[index];
    const g = pixels[index + 1];
    const b = pixels[index + 2];
    const a = pixels[index + 3];

    return new Color(r, g, b, a);
  }

  private static _readStringLine(uint8array: Uint8Array, startIndex: number): string {
    let line = "";
    const limit = Math.min(uint8array.length, startIndex + MAX_HDR_LINE_LENGTH);

    for (let i = startIndex; i < limit; i++) {
      const character = String.fromCharCode(uint8array[i]);

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
    const headerLimit = Math.min(uint8array.length, MAX_HDR_HEADER_BYTES);

    do {
      lineIndex += line.length + 1;
      if (lineIndex >= headerLimit) {
        throw "HDR Bad header format, missing header terminator";
      }
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
    if (lineIndex >= headerLimit) {
      throw "HDR Bad header format, no size";
    }
    line = this._readStringLine(uint8array, lineIndex);

    const match = HDR_SIZE_REGEX.exec(line);

    // TODO. Support +Y and -X if needed.
    if (!match || match.length < 3) {
      throw "HDR Bad header format, no size";
    }
    width = Number(match[2]);
    height = Number(match[1]);

    if (
      !Number.isSafeInteger(width) ||
      !Number.isSafeInteger(height) ||
      width < MIN_HDR_WIDTH ||
      width > MAX_HDR_WIDTH ||
      height < 2 ||
      height > MAX_HDR_HEIGHT
    ) {
      throw "HDR Bad header format, unsupported size";
    }

    const pixelCount = width * height;
    if (!Number.isSafeInteger(pixelCount) || pixelCount <= 0 || pixelCount > MAX_HDR_PIXELS) {
      throw "HDR Bad header format, pixel count exceeds limit";
    }

    lineIndex += line.length + 1;
    if (lineIndex >= uint8array.length) {
      throw "HDR Bad Format, missing pixel data";
    }

    return {
      height: height,
      width: width,
      dataPosition: lineIndex
    };
  }

  private static _readPixels(buffer: Uint8Array, width: number, height: number): Uint8Array {
    const scanLineWidth = width;
    const byteLength = buffer.byteLength;
    const expectedBytes = 4 * width * height;

    if (byteLength < 4) {
      throw "HDR Bad Format, truncated pixel data";
    }

    if (buffer[0] != 2 || buffer[1] != 2 || buffer[2] & 0x80 || width < MIN_HDR_WIDTH || width > MAX_HDR_WIDTH) {
      // this file is not run length encoded
      // read values sequentially
      if (byteLength < expectedBytes) {
        throw "HDR Bad Format, truncated uncompressed pixel data";
      }
      return buffer.subarray(0, expectedBytes);
    }

    const minRleScanlineBytes = 4 + 2 * Math.ceil((4 * width) / 127);
    if (byteLength < height * minRleScanlineBytes) {
      throw "HDR Bad Format, truncated RLE pixel data";
    }

    const dataRGBA = new Uint8Array(expectedBytes);

    let offset = 0,
      pos = 0;
    const ptrEnd = 4 * scanLineWidth;
    const scanLineBuffer = new Uint8Array(ptrEnd);
    let numScanLines = height; // read in each successive scanLine

    while (numScanLines > 0) {
      if (pos + 4 > byteLength) {
        throw "HDR Bad Format, truncated RLE scanline header";
      }
      const a = buffer[pos++];
      const b = buffer[pos++];
      const c = buffer[pos++];
      const d = buffer[pos++];

      if (a != 2 || b != 2 || c & 0x80 || ((c << 8) | d) != scanLineWidth) {
        // eslint-disable-next-line no-throw-literal
        throw "HDR Bad header format, wrong scan line width";
      }

      // read each of the four channels for the scanline into the buffer
      // first red, then green, then blue, then exponent

      let ptr = 0,
        count;

      while (ptr < ptrEnd) {
        if (pos >= byteLength) {
          throw "HDR Bad Format, truncated scanline data";
        }
        count = buffer[pos++];
        const isEncodedRun = count > 128;
        if (isEncodedRun) count -= 128;

        if (0 === count || ptr + count > ptrEnd) {
          throw "HDR Bad Format, bad scanline data (run)";
        }

        if (isEncodedRun) {
          if (pos >= byteLength) {
            throw "HDR Bad Format, truncated scanline run value";
          }
          // a (encoded) run of the same value
          const byteValue = buffer[pos++];

          for (let i = 0; i < count; i++) {
            scanLineBuffer[ptr++] = byteValue;
          } //ptr += count;
        } else {
          if (pos + count > byteLength) {
            throw "HDR Bad Format, truncated scanline literal run";
          }
          // a literal-run
          scanLineBuffer.set(buffer.subarray(pos, pos + count), ptr);
          ptr += count;
          pos += count;
        }
      } // now convert data from buffer into rgba
      // first red, then green, then blue, then exponent (alpha)

      const l = scanLineWidth; //scanLine_buffer.byteLength;

      for (let i = 0; i < l; i++) {
        let off = 0;
        dataRGBA[offset] = scanLineBuffer[i + off];
        off += scanLineWidth;

        dataRGBA[offset + 1] = scanLineBuffer[i + off];
        off += scanLineWidth;

        dataRGBA[offset + 2] = scanLineBuffer[i + off];
        off += scanLineWidth;

        dataRGBA[offset + 3] = scanLineBuffer[i + off];
        offset += 4;
      }

      numScanLines--;
    }

    return dataRGBA;
  }

  private static _RGBEToLinear(color: Color): void {
    const scaleFactor = Math.pow(2, color.a - 128) / 255;
    color.r *= scaleFactor;
    color.g *= scaleFactor;
    color.b *= scaleFactor;
    color.a = 1;
  }

  private static _linearToRGBM(color: Color, maxRange: number): void {
    const maxRGB = Math.max(color.r, Math.max(color.g, color.b));
    let M = Math.min(maxRGB / maxRange, 1);
    M = Math.ceil(M * 255);
    const scaleFactor = 65025 / (M * maxRange); // 255 * (255 / (M * maxRange) )

    color.r *= scaleFactor;
    color.g *= scaleFactor;
    color.b *= scaleFactor;
    color.a *= M;
  }
  load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<TextureCube> {
    return new AssetPromise((resolve, reject) => {
      const engine = resourceManager.engine;
      const requestConfig = { ...item, type: "arraybuffer" } as RequestConfig;
      const url = item.url;
      resourceManager
        // @ts-ignore
        ._request<ArrayBuffer>(url, requestConfig)
        .then((buffer) => {
          const texture = HDRLoader._setTextureByBuffer(engine, buffer);
          engine.resourceManager.addContentRestorer(new HDRContentRestorer(texture, url, requestConfig));
          resolve(texture);
        })
        .catch(reject);
    });
  }
}

/**
 * @internal
 */
class HDRContentRestorer extends ContentRestorer<TextureCube> {
  constructor(
    resource: TextureCube,
    public url: string,
    public requestConfig: RequestConfig
  ) {
    super(resource);
  }

  override restoreContent(): AssetPromise<TextureCube> {
    return new AssetPromise((resolve, reject) => {
      const resource = this.resource;
      const engine = resource.engine;
      engine.resourceManager
        // @ts-ignore
        ._request<ArrayBuffer>(this.url, this.requestConfig)
        .then((buffer) => {
          HDRLoader._setTextureByBuffer(engine, buffer, resource);
          resolve(resource);
        })
        .catch(reject);
    });
  }
}
