import { Engine, TextureCube, TextureCubeFace, TextureFormat } from "@galacean/engine-core";
import { Vector3 } from "@galacean/engine-math";

interface IHDRHeader {
  width: number;
  height: number;
  dataPosition: number;
}

/**
 * @internal
 * HDR panorama to cubemap decoder.
 */
export class HDRDecoder {
  private static _PI = Math.PI;

  private static _rightBottomBack = new Vector3(1.0, -1.0, -1.0);
  private static _rightBottomFront = new Vector3(1.0, -1.0, 1.0);
  private static _rightUpBack = new Vector3(1.0, 1.0, -1.0);
  private static _rightUpFront = new Vector3(1.0, 1.0, 1.0);
  private static _leftBottomBack = new Vector3(-1.0, -1.0, -1.0);
  private static _leftBottomFront = new Vector3(-1.0, -1.0, 1.0);
  private static _leftUpBack = new Vector3(-1.0, 1.0, -1.0);
  private static _leftUpFront = new Vector3(-1.0, 1.0, 1.0);

  private static _faceRight = [
    HDRDecoder._rightBottomBack,
    HDRDecoder._rightBottomFront,
    HDRDecoder._rightUpBack,
    HDRDecoder._rightUpFront
  ];
  private static _faceLeft = [
    HDRDecoder._leftBottomFront,
    HDRDecoder._leftBottomBack,
    HDRDecoder._leftUpFront,
    HDRDecoder._leftUpBack
  ];
  private static _faceUp = [
    HDRDecoder._leftBottomFront,
    HDRDecoder._rightBottomFront,
    HDRDecoder._leftBottomBack,
    HDRDecoder._rightBottomBack
  ];
  private static _faceBottom = [
    HDRDecoder._leftUpBack,
    HDRDecoder._rightUpBack,
    HDRDecoder._leftUpFront,
    HDRDecoder._rightUpFront
  ];
  private static _faceFront = [
    HDRDecoder._leftBottomBack,
    HDRDecoder._rightBottomBack,
    HDRDecoder._leftUpBack,
    HDRDecoder._rightUpBack
  ];
  private static _faceBack = [
    HDRDecoder._rightBottomFront,
    HDRDecoder._leftBottomFront,
    HDRDecoder._rightUpFront,
    HDRDecoder._leftUpFront
  ];

  private static _faces = [
    HDRDecoder._faceRight,
    HDRDecoder._faceLeft,
    HDRDecoder._faceUp,
    HDRDecoder._faceBottom,
    HDRDecoder._faceFront,
    HDRDecoder._faceBack
  ];

  private static _rotDX1 = new Vector3();
  private static _rotDX2 = new Vector3();
  private static _xv1 = new Vector3();
  private static _xv2 = new Vector3();
  private static _dir = new Vector3();

  static decode(engine: Engine, buffer: ArrayBuffer, texture?: TextureCube): TextureCube {
    const bufferArray = new Uint8Array(buffer);
    const { width, height, dataPosition } = HDRDecoder._parseHeader(bufferArray);
    const cubeSize = height >> 1;
    texture ||= new TextureCube(engine, cubeSize, TextureFormat.R16G16B16A16, true, false);
    const pixels = HDRDecoder._readPixels(bufferArray.subarray(dataPosition), width, height);

    const faces = HDRDecoder._faces;
    for (let faceIndex = 0; faceIndex < 6; faceIndex++) {
      const faceData = HDRDecoder._createCubemapData(cubeSize, faces[faceIndex], pixels, width, height);
      texture.setPixelBuffer(TextureCubeFace.PositiveX + faceIndex, faceData, 0);
    }
    texture.generateMipmaps();
    return texture;
  }

  private static _createCubemapData(
    texSize: number,
    faceData: Vector3[],
    pixels: Uint8Array,
    inputWidth: number,
    inputHeight: number
  ): Float32Array {
    const textureArray = new Float32Array(texSize * texSize * 4);
    const pi = this._PI;
    const invSize = 1 / texSize;
    const rotDX1 = this._rotDX1.copyFrom(faceData[1]).subtract(faceData[0]).scale(invSize);
    const rotDX2 = this._rotDX2.copyFrom(faceData[3]).subtract(faceData[2]).scale(invSize);

    const v = this._dir;
    const xv1Temp = this._xv1;
    const xv2Temp = this._xv2;
    let fy = 0;

    for (let y = 0; y < texSize; y++) {
      const xv1 = xv1Temp.copyFrom(faceData[0]);
      const xv2 = xv2Temp.copyFrom(faceData[2]);

      for (let x = 0; x < texSize; x++) {
        // v = lerp(xv1, xv2, fy) = xv1 + (xv2 - xv1) * fy
        v.x = xv1.x + (xv2.x - xv1.x) * fy;
        v.y = xv1.y + (xv2.y - xv1.y) * fy;
        v.z = xv1.z + (xv2.z - xv1.z) * fy;
        v.normalize();

        // Spherical projection + RGBE→Linear
        const theta = Math.atan2(v.z, v.x);
        const phi = Math.acos(v.y);

        const dx = (theta / pi) * 0.5 + 0.5;
        const dy = phi / pi;

        let px = Math.round(dx * inputWidth);
        if (px < 0) px = 0;
        else if (px >= inputWidth) px = inputWidth - 1;

        let py = Math.round(dy * inputHeight);
        if (py < 0) py = 0;
        else if (py >= inputHeight) py = inputHeight - 1;

        const srcIndex = (inputHeight - py - 1) * inputWidth * 4 + px * 4;

        // RGBE to linear
        const scaleFactor = Math.pow(2, pixels[srcIndex + 3] - 128) / 255;
        const r = pixels[srcIndex] * scaleFactor;
        const g = pixels[srcIndex + 1] * scaleFactor;
        const b = pixels[srcIndex + 2] * scaleFactor;

        const dstIndex = y * texSize * 4 + x * 4;
        textureArray[dstIndex] = r;
        textureArray[dstIndex + 1] = g;
        textureArray[dstIndex + 2] = b;
        textureArray[dstIndex + 3] = 1;

        xv1.add(rotDX1);
        xv2.add(rotDX2);
      }

      fy += invSize;
    }

    return textureArray;
  }

  private static _readStringLine(uint8array: Uint8Array, startIndex: number): string {
    let line = "";

    for (let i = startIndex, n = uint8array.length - startIndex; i < n; i++) {
      const character = String.fromCharCode(uint8array[i]);
      if (character === "\n") {
        break;
      }
      line += character;
    }

    return line;
  }

  private static _parseHeader(uint8array: Uint8Array): IHDRHeader {
    let height = 0;
    let width = 0;

    let line = this._readStringLine(uint8array, 0);
    if (line[0] !== "#" || line[1] !== "?") {
      throw "Bad HDR Format.";
    }

    let endOfHeader = false;
    let findFormat = false;
    let lineIndex = 0;

    do {
      lineIndex += line.length + 1;
      line = this._readStringLine(uint8array, lineIndex);

      if (line === "FORMAT=32-bit_rle_rgbe") {
        findFormat = true;
      } else if (line.length === 0) {
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

    return { height, width, dataPosition: lineIndex };
  }

  private static _readPixels(buffer: Uint8Array, width: number, height: number): Uint8Array {
    const byteLength = buffer.byteLength;
    const dataRGBA = new Uint8Array(4 * width * height);

    let offset = 0;
    let pos = 0;
    const ptrEnd = 4 * width;
    const scanLineBuffer = new Uint8Array(ptrEnd);
    let numScanLines = height;

    while (numScanLines > 0 && pos < byteLength) {
      const a = buffer[pos++];
      const b = buffer[pos++];
      const c = buffer[pos++];
      const d = buffer[pos++];

      if (a !== 2 || b !== 2 || c & 0x80 || width < 8 || width > 32767) {
        return buffer;
      }

      if (((c << 8) | d) !== width) {
        throw "HDR Bad header format, wrong scan line width";
      }

      let ptr = 0;

      while (ptr < ptrEnd && pos < byteLength) {
        let count = buffer[pos++];
        const isEncodedRun = count > 128;
        if (isEncodedRun) count -= 128;

        if (count === 0 || ptr + count > ptrEnd) {
          throw "HDR Bad Format, bad scanline data (run)";
        }

        if (isEncodedRun) {
          const byteValue = buffer[pos++];
          for (let i = 0; i < count; i++) {
            scanLineBuffer[ptr++] = byteValue;
          }
        } else {
          scanLineBuffer.set(buffer.subarray(pos, pos + count), ptr);
          ptr += count;
          pos += count;
        }
      }

      for (let i = 0; i < width; i++, offset += 4) {
        dataRGBA[offset] = scanLineBuffer[i];
        dataRGBA[offset + 1] = scanLineBuffer[i + width];
        dataRGBA[offset + 2] = scanLineBuffer[i + width * 2];
        dataRGBA[offset + 3] = scanLineBuffer[i + width * 3];
      }

      numScanLines--;
    }

    return dataRGBA;
  }
}
