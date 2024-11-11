import {
  AssetPromise,
  AssetType,
  ContentRestorer,
  Engine,
  LoadItem,
  Loader,
  ResourceManager,
  TextureCube,
  TextureCubeFace,
  request,
  resourceLoader
} from "@galacean/engine-core";
import { RequestConfig } from "@galacean/engine-core/types/asset/request";
import { Color, Vector3 } from "@galacean/engine-math";

const PI = Math.PI;

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
    texture ||= new TextureCube(engine, cubeSize);
    const pixels = HDRLoader._readPixels(bufferArray.subarray(dataPosition), width, height);
    const cubeMapData = HDRLoader._convertToCubemap(pixels, width, height, cubeSize);
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

  private static _readPixels(buffer: Uint8Array, width: number, height: number): Uint8Array {
    const scanLineWidth = width;
    const byteLength = buffer.byteLength;

    const dataRGBA = new Uint8Array(4 * width * height);

    let offset = 0,
      pos = 0;
    const ptrEnd = 4 * scanLineWidth;
    const scanLineBuffer = new Uint8Array(ptrEnd);
    let numScanLines = height; // read in each successive scanLine

    while (numScanLines > 0 && pos < byteLength) {
      const a = buffer[pos++];
      const b = buffer[pos++];
      const c = buffer[pos++];
      const d = buffer[pos++];

      if (a != 2 || b != 2 || c & 0x80 || width < 8 || width > 32767) {
        // this file is not run length encoded
        // read values sequentially
        return buffer;
      }

      if (((c << 8) | d) != scanLineWidth) {
        // eslint-disable-next-line no-throw-literal
        throw "HDR Bad header format, wrong scan line width";
      }

      // read each of the four channels for the scanline into the buffer
      // first red, then green, then blue, then exponent

      let ptr = 0,
        count;

      while (ptr < ptrEnd && pos < byteLength) {
        count = buffer[pos++];
        const isEncodedRun = count > 128;
        if (isEncodedRun) count -= 128;

        if (0 === count || ptr + count > ptrEnd) {
          throw "HDR Bad Format, bad scanline data (run)";
        }

        if (isEncodedRun) {
          // a (encoded) run of the same value
          const byteValue = buffer[pos++];

          for (let i = 0; i < count; i++) {
            scanLineBuffer[ptr++] = byteValue;
          } //ptr += count;
        } else {
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
      resourceManager
        .request<ArrayBuffer>(item.url, requestConfig)
        .then((buffer) => {
          const texture = HDRLoader._setTextureByBuffer(engine, buffer);
          engine.resourceManager.addContentRestorer(new HDRContentRestorer(texture, item.url, requestConfig));
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
      request<ArrayBuffer>(this.url, this.requestConfig)
        .then((buffer) => {
          HDRLoader._setTextureByBuffer(this.resource.engine, buffer, this.resource);
          resolve(this.resource);
        })
        .catch(reject);
    });
  }
}
