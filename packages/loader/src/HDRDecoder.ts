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
  // Float32 to Float16 lookup tables (http://www.fox-toolkit.org/ftp/fasthalffloatconversion.pdf)
  private static _float2HalfTables = HDRDecoder._generateFloat2HalfTables();
  private static _floatView = new Float32Array(1);
  private static _uint32View = new Uint32Array(HDRDecoder._floatView.buffer);

  private static _generateFloat2HalfTables(): { baseTable: Uint32Array; shiftTable: Uint32Array } {
    const baseTable = new Uint32Array(512);
    const shiftTable = new Uint32Array(512);
    for (let i = 0; i < 256; ++i) {
      const e = i - 127;
      if (e < -27) {
        baseTable[i] = 0x0000;
        baseTable[i | 0x100] = 0x8000;
        shiftTable[i] = 24;
        shiftTable[i | 0x100] = 24;
      } else if (e < -14) {
        baseTable[i] = 0x0400 >> (-e - 14);
        baseTable[i | 0x100] = (0x0400 >> (-e - 14)) | 0x8000;
        shiftTable[i] = -e - 1;
        shiftTable[i | 0x100] = -e - 1;
      } else if (e <= 15) {
        baseTable[i] = (e + 15) << 10;
        baseTable[i | 0x100] = ((e + 15) << 10) | 0x8000;
        shiftTable[i] = 13;
        shiftTable[i | 0x100] = 13;
      } else if (e < 128) {
        baseTable[i] = 0x7c00;
        baseTable[i | 0x100] = 0xfc00;
        shiftTable[i] = 24;
        shiftTable[i | 0x100] = 24;
      } else {
        baseTable[i] = 0x7c00;
        baseTable[i | 0x100] = 0xfc00;
        shiftTable[i] = 13;
        shiftTable[i | 0x100] = 13;
      }
    }
    return { baseTable, shiftTable };
  }

  // Cubemap face corner vectors
  private static _rightBottomBack = new Vector3(1.0, -1.0, -1.0);
  private static _rightBottomFront = new Vector3(1.0, -1.0, 1.0);
  private static _rightUpBack = new Vector3(1.0, 1.0, -1.0);
  private static _rightUpFront = new Vector3(1.0, 1.0, 1.0);
  private static _leftBottomBack = new Vector3(-1.0, -1.0, -1.0);
  private static _leftBottomFront = new Vector3(-1.0, -1.0, 1.0);
  private static _leftUpBack = new Vector3(-1.0, 1.0, -1.0);
  private static _leftUpFront = new Vector3(-1.0, 1.0, 1.0);

  private static _faces = [
    [HDRDecoder._rightBottomBack, HDRDecoder._rightBottomFront, HDRDecoder._rightUpBack, HDRDecoder._rightUpFront],
    [HDRDecoder._leftBottomFront, HDRDecoder._leftBottomBack, HDRDecoder._leftUpFront, HDRDecoder._leftUpBack],
    [
      HDRDecoder._leftBottomFront,
      HDRDecoder._rightBottomFront,
      HDRDecoder._leftBottomBack,
      HDRDecoder._rightBottomBack
    ],
    [HDRDecoder._leftUpBack, HDRDecoder._rightUpBack, HDRDecoder._leftUpFront, HDRDecoder._rightUpFront],
    [HDRDecoder._leftBottomBack, HDRDecoder._rightBottomBack, HDRDecoder._leftUpBack, HDRDecoder._rightUpBack],
    [HDRDecoder._rightBottomFront, HDRDecoder._leftBottomFront, HDRDecoder._rightUpFront, HDRDecoder._leftUpFront]
  ];

  // Temp vectors for cubemap projection (reused to avoid allocation)
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
    faceCorners: Vector3[],
    pixels: Uint8Array,
    inputWidth: number,
    inputHeight: number
  ): Uint16Array {
    const facePixels = new Uint16Array(texSize * texSize * 4);
    const invSize = 1 / texSize;
    const rotDX1 = this._rotDX1.copyFrom(faceCorners[1]).subtract(faceCorners[0]).scale(invSize);
    const rotDX2 = this._rotDX2.copyFrom(faceCorners[3]).subtract(faceCorners[2]).scale(invSize);

    const floatView = HDRDecoder._floatView;
    const uint32View = HDRDecoder._uint32View;
    const { baseTable, shiftTable } = HDRDecoder._float2HalfTables;
    const dir = this._dir;
    const xv1Temp = this._xv1;
    const xv2Temp = this._xv2;

    // Pre-compute half float for 1.0
    floatView[0] = 1;
    const f1 = uint32View[0];
    const e1 = (f1 >> 23) & 0x1ff;
    const one = baseTable[e1] + ((f1 & 0x007fffff) >> shiftTable[e1]);

    let fy = 0;

    for (let y = 0; y < texSize; y++) {
      const xv1 = xv1Temp.copyFrom(faceCorners[0]);
      const xv2 = xv2Temp.copyFrom(faceCorners[2]);

      for (let x = 0; x < texSize; x++) {
        dir.x = xv1.x + (xv2.x - xv1.x) * fy;
        dir.y = xv1.y + (xv2.y - xv1.y) * fy;
        dir.z = xv1.z + (xv2.z - xv1.z) * fy;
        dir.normalize();

        const theta = Math.atan2(dir.z, dir.x);
        const phi = Math.acos(dir.y);

        let px = Math.round(((theta / Math.PI) * 0.5 + 0.5) * inputWidth);
        if (px < 0) px = 0;
        else if (px >= inputWidth) px = inputWidth - 1;

        let py = Math.round((phi / Math.PI) * inputHeight);
        if (py < 0) py = 0;
        else if (py >= inputHeight) py = inputHeight - 1;

        const srcIndex = (inputHeight - py - 1) * inputWidth * 4 + px * 4;

        // RGBE to linear half float
        const scaleFactor = Math.pow(2, pixels[srcIndex + 3] - 128) / 255;

        const dstIndex = y * texSize * 4 + x * 4;
        for (let c = 0; c < 3; c++) {
          floatView[0] = pixels[srcIndex + c] * scaleFactor;
          const f = uint32View[0];
          const e = (f >> 23) & 0x1ff;
          facePixels[dstIndex + c] = baseTable[e] + ((f & 0x007fffff) >> shiftTable[e]);
        }
        facePixels[dstIndex + 3] = one;

        xv1.add(rotDX1);
        xv2.add(rotDX2);
      }

      fy += invSize;
    }

    return facePixels;
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

    // Only support -Y +X layout (the de facto standard for HDR files).
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
