import {
  AssetPromise,
  AssetType,
  GLCapabilityType,
  Loader,
  LoadItem,
  resourceLoader,
  ResourceManager,
  TextureCubeFace,
  TextureCubeMap,
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

@resourceLoader(AssetType.HDR, ["hdr"])
class HDRLoader extends Loader<TextureCubeMap> {
  private static _cubeSize = 256;

  private static _faceRight = [
    new Vector3(1.0, -1.0, -1.0),
    new Vector3(1.0, -1.0, 1.0),
    new Vector3(1.0, 1.0, -1.0),
    new Vector3(1.0, 1.0, 1.0)
  ];

  private static _faceLeft = [
    new Vector3(-1.0, -1.0, 1.0),
    new Vector3(-1.0, -1.0, -1.0),
    new Vector3(-1.0, 1.0, 1.0),
    new Vector3(-1.0, 1.0, -1.0)
  ];

  private static _faceUp = [
    new Vector3(-1.0, -1.0, 1.0),
    new Vector3(1.0, -1.0, 1.0),
    new Vector3(-1.0, -1.0, -1.0),
    new Vector3(1.0, -1.0, -1.0)
  ];

  private static _faceBottom = [
    new Vector3(-1.0, 1.0, -1.0),
    new Vector3(1.0, 1.0, -1.0),
    new Vector3(-1.0, 1.0, 1.0),
    new Vector3(1.0, 1.0, 1.0)
  ];

  private static _faceFront = [
    new Vector3(-1.0, -1.0, -1.0),
    new Vector3(1.0, -1.0, -1.0),
    new Vector3(-1.0, 1.0, -1.0),
    new Vector3(1.0, 1.0, -1.0)
  ];

  private static _faceBack = [
    new Vector3(1.0, -1.0, 1.0),
    new Vector3(-1.0, -1.0, 1.0),
    new Vector3(1.0, 1.0, 1.0),
    new Vector3(-1.0, 1.0, 1.0)
  ];

  private static _tempVector3 = new Vector3();
  private static _temp2Vector3 = new Vector3();
  private static _temp3Vector3 = new Vector3();
  private static _temp4Vector3 = new Vector3();
  private static _temp5Vector3 = new Vector3();

  private static _convertToCubemap(
    pixels: Uint8Array,
    inputWidth: number,
    inputHeight: number,
    size: number
  ): Uint8Array[] {
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
  ) {
    const textureArray = new Uint8Array(texSize * texSize * 4);
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

    const dy = 1 / texSize;
    let fy = 0;

    for (let y = 0; y < texSize; y++) {
      let xv1 = this._temp3Vector3.setValue(0, 0, 0).add(faceData[0]);
      let xv2 = this._temp4Vector3.setValue(0, 0, 0).add(faceData[2]);

      for (let x = 0; x < texSize; x++) {
        const v = this._temp5Vector3.setValue(0, 0, 0).add(xv2).subtract(xv1).scale(fy).add(xv1);
        v.normalize();

        const color = this._calcProjectionSpherical(v, pixels, inputWidth, inputHeight);

        // 4 channels per pixels
        textureArray[y * texSize * 4 + x * 4] = color.r;
        textureArray[y * texSize * 4 + x * 4 + 1] = color.g;
        textureArray[y * texSize * 4 + x * 4 + 2] = color.b;
        textureArray[y * texSize * 4 + x * 4 + 3] = color.a;

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

    while (theta < -Math.PI) {
      theta += 2 * Math.PI;
    }
    while (theta > Math.PI) {
      theta -= 2 * Math.PI;
    }

    let dx = theta / Math.PI;
    let dy = phi / Math.PI;

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
    const r = pixels[inputY * inputWidth * 4 + px * 4];
    const g = pixels[inputY * inputWidth * 4 + px * 4 + 1];
    const b = pixels[inputY * inputWidth * 4 + px * 4 + 2];
    const a = pixels[inputY * inputWidth * 4 + px * 4 + 3];

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
    const scanline_width = width;

    const data_rgba = new Uint8Array(4 * width * height);

    let offset = 0,
      pos = 0;
    const ptr_end = 4 * scanline_width;
    const rgbeStart = new Uint8Array(4);
    const scanline_buffer = new Uint8Array(ptr_end);
    let num_scanlines = height; // read in each successive scanline

    while (num_scanlines > 0 && pos < buffer.byteLength) {
      rgbeStart[0] = buffer[pos++];
      rgbeStart[1] = buffer[pos++];
      rgbeStart[2] = buffer[pos++];
      rgbeStart[3] = buffer[pos++];

      if (2 != rgbeStart[0] || 2 != rgbeStart[1] || ((rgbeStart[2] << 8) | rgbeStart[3]) != scanline_width) {
        throw "HDR Bad header format, wrong scan line width";
      }

      // read each of the four channels for the scanline into the buffer
      // first red, then green, then blue, then exponent

      let ptr = 0,
        count;

      while (ptr < ptr_end && pos < buffer.byteLength) {
        count = buffer[pos++];
        const isEncodedRun = count > 128;
        if (isEncodedRun) count -= 128;

        if (0 === count || ptr + count > ptr_end) {
          throw "HDR Bad Format, bad scanline data (run)";
        }

        if (isEncodedRun) {
          // a (encoded) run of the same value
          const byteValue = buffer[pos++];

          for (let i = 0; i < count; i++) {
            scanline_buffer[ptr++] = byteValue;
          } //ptr += count;
        } else {
          // a literal-run
          scanline_buffer.set(buffer.subarray(pos, pos + count), ptr);
          ptr += count;
          pos += count;
        }
      } // now convert data from buffer into rgba
      // first red, then green, then blue, then exponent (alpha)

      const l = scanline_width; //scanline_buffer.byteLength;

      for (let i = 0; i < l; i++) {
        let off = 0;
        data_rgba[offset] = scanline_buffer[i + off];
        off += scanline_width; //1;

        data_rgba[offset + 1] = scanline_buffer[i + off];
        off += scanline_width; //1;

        data_rgba[offset + 2] = scanline_buffer[i + off];
        off += scanline_width; //1;

        data_rgba[offset + 3] = scanline_buffer[i + off];
        offset += 4;
      }

      num_scanlines--;
    }

    return data_rgba;
  }

  load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<TextureCubeMap> {
    return new AssetPromise((resolve, reject) => {
      const engine = resourceManager.engine;
      const supportFloatTexture = engine._hardwareRenderer.canIUse(GLCapabilityType.textureFloat);
      const cubeSize = HDRLoader._cubeSize;

      resourceManager
        .load<ArrayBuffer>({
          url: item.url,
          type: AssetType.Buffer
        })
        .then((buffer) => {
          const uint8Array = new Uint8Array(buffer);
          const { width, height, dataPosition } = HDRLoader._parseHeader(uint8Array);
          const pixels = HDRLoader._readPixels(uint8Array.subarray(dataPosition), width, height);
          const cubeMapData = HDRLoader._convertToCubemap(pixels, width, height, cubeSize);
          const floatCubeMapData = new Array<Float32Array>(6);
          const texture = new TextureCubeMap(
            engine,
            cubeSize,
            supportFloatTexture ? TextureFormat.R32G32B32A32 : undefined
          );
          texture._isHDR = true;

          // convert to float texture if enabled
          if (supportFloatTexture) {
            for (let faceIndex = 0; faceIndex < 6; faceIndex++) {
              const uint8Array = cubeMapData[faceIndex];
              const length = uint8Array.length;
              const floatArray = new Float32Array(length);
              floatCubeMapData[faceIndex] = floatArray;

              for (let pixel = 0; pixel < length; pixel += 4) {
                const r = uint8Array[pixel];
                const g = uint8Array[pixel + 1];
                const b = uint8Array[pixel + 2];
                const a = uint8Array[pixel + 3];
                const scale = Math.pow(2, a - 128) / 255;

                floatArray[pixel] = r * scale;
                floatArray[pixel + 1] = g * scale;
                floatArray[pixel + 2] = b * scale;
                floatArray[pixel + 3] = 1;
              }
            }
          }

          for (let faceIndex = 0; faceIndex < 6; faceIndex++) {
            texture.setPixelBuffer(
              TextureCubeFace.PositiveX + faceIndex,
              (supportFloatTexture ? floatCubeMapData : cubeMapData)[faceIndex],
              0
            );
          }
          texture.generateMipmaps();
          resolve(texture);
        })
        .catch(reject);
    });
  }
}
