const MIN_HDR_WIDTH = 8;
const MAX_HDR_WIDTH = 0x7fff;
const MAX_HDR_HEIGHT = 0x7fff;
const MAX_HDR_PIXELS = 33_554_432; // 8192 x 4096 max HDR (128 MiB RGBE / 256 MiB half-float)
const MAX_HDR_HEADER_BYTES = 65_536;
const MAX_HDR_LINE_LENGTH = 4096;
const HDR_SIZE_REGEX = /^-Y (\d+) \+X (\d+)\r?$/;

/**
 * HDR (Radiance RGBE) image decoder.
 *
 * Decodes .hdr files into pixel data. Supports parsing the header
 * and decoding RLE-compressed RGBE scanlines into R16G16B16A16_SFloat half-float pixels.
 */
export class HDRDecoder {
  private static _float2HalfTables = HDRDecoder._generateFloat2HalfTables();
  private static _floatView = new Float32Array(1);
  private static _uint32View = new Uint32Array(HDRDecoder._floatView.buffer);

  /**
   * Parse the header of an HDR file.
   * @returns Header info including width, height, and data start position.
   */
  static parseHeader(uint8array: Uint8Array): IHDRHeader {
    let line = this._readStringLine(uint8array, 0);
    if (line[0] !== "#" || line[1] !== "?") {
      throw "HDRDecoder: invalid file header";
    }

    let endOfHeader = false;
    let findFormat = false;
    let lineIndex = 0;
    const headerLimit = Math.min(uint8array.length, MAX_HDR_HEADER_BYTES);

    do {
      lineIndex += line.length + 1;
      if (lineIndex >= headerLimit) {
        throw "HDRDecoder: missing header terminator";
      }
      line = this._readStringLine(uint8array, lineIndex);
      if (line === "FORMAT=32-bit_rle_rgbe") findFormat = true;
      else if (line.length === 0) endOfHeader = true;
    } while (!endOfHeader);

    if (!findFormat) {
      throw "HDRDecoder: unsupported format, expected 32-bit_rle_rgbe";
    }

    lineIndex += line.length + 1;
    if (lineIndex >= headerLimit) {
      throw "HDRDecoder: missing image size, only -Y +X layout is supported";
    }
    line = this._readStringLine(uint8array, lineIndex);

    const match = HDR_SIZE_REGEX.exec(line);
    if (!match || match.length < 3) {
      throw "HDRDecoder: missing image size, only -Y +X layout is supported";
    }
    const width = Number(match[2]);
    const height = Number(match[1]);

    if (
      !Number.isSafeInteger(width) ||
      !Number.isSafeInteger(height) ||
      width < MIN_HDR_WIDTH ||
      width > MAX_HDR_WIDTH ||
      height < 1 ||
      height > MAX_HDR_HEIGHT
    ) {
      throw "HDRDecoder: unsupported image dimensions";
    }

    const pixelCount = width * height;
    if (!Number.isSafeInteger(pixelCount) || pixelCount <= 0 || pixelCount > MAX_HDR_PIXELS) {
      throw "HDRDecoder: image pixel count exceeds limit";
    }

    const dataPosition = lineIndex + line.length + 1;
    if (dataPosition >= uint8array.length) {
      throw "HDRDecoder: missing pixel data";
    }

    return { height, width, dataPosition };
  }

  /**
   * Decode an HDR file buffer into R16G16B16A16_SFloat half-float pixel data.
   * @param buffer - The full HDR file as Uint8Array.
   * @returns Object with width, height, and half-float pixel data.
   */
  static decode(buffer: Uint8Array): { width: number; height: number; pixels: Uint16Array } {
    const header = this.parseHeader(buffer);
    const { width, height, dataPosition } = header;
    const rgbe = this._readPixels(buffer.subarray(dataPosition), width, height);
    const pixels = this._rgbeToHalfFloat(rgbe, width, height);
    return { width, height, pixels };
  }

  /**
   * @internal
   * Convert RGBE pixel data to R16G16B16A16_SFloat half-float.
   */
  static _rgbeToHalfFloat(rgbe: Uint8Array, width: number, height: number): Uint16Array {
    if (
      !Number.isSafeInteger(width) ||
      !Number.isSafeInteger(height) ||
      width <= 0 ||
      height <= 0 ||
      width * height > MAX_HDR_PIXELS ||
      rgbe.byteLength < width * height * 4
    ) {
      throw "HDRDecoder: invalid RGBE pixel buffer dimensions";
    }
    const floatView = this._floatView;
    const uint32View = this._uint32View;
    const { baseTable, shiftTable } = this._float2HalfTables;
    const one = 0x3c00; // Half float 1.0
    const pixelCount = width * height;
    const result = new Uint16Array(pixelCount * 4);

    for (let i = 0; i < pixelCount; i++) {
      const srcIdx = i * 4;
      const dstIdx = i * 4;
      const scaleFactor = Math.pow(2, rgbe[srcIdx + 3] - 128 - 8);

      for (let c = 0; c < 3; c++) {
        floatView[0] = Math.min(rgbe[srcIdx + c] * scaleFactor, 65504);
        const f = uint32View[0];
        const e = (f >> 23) & 0x1ff;
        result[dstIdx + c] = baseTable[e] + ((f & 0x007fffff) >> shiftTable[e]);
      }
      result[dstIdx + 3] = one;
    }
    return result;
  }

  /**
   * @internal
   * Decode RLE-compressed RGBE scanlines into raw RGBE pixel data.
   */
  static _readPixels(buffer: Uint8Array, width: number, height: number): Uint8Array {
    if (
      !Number.isSafeInteger(width) ||
      !Number.isSafeInteger(height) ||
      width < MIN_HDR_WIDTH ||
      width > MAX_HDR_WIDTH ||
      height < 1 ||
      height > MAX_HDR_HEIGHT ||
      width * height > MAX_HDR_PIXELS
    ) {
      throw "HDRDecoder: unsupported image dimensions";
    }

    const byteLength = buffer.byteLength;
    const expectedBytes = 4 * width * height;
    if (byteLength < 4) {
      throw "HDRDecoder: truncated pixel data";
    }

    if (buffer[0] !== 2 || buffer[1] !== 2 || buffer[2] & 0x80) {
      if (byteLength < expectedBytes) {
        throw "HDRDecoder: truncated uncompressed pixel data";
      }
      return buffer.subarray(0, expectedBytes);
    }

    const minRleScanlineBytes = 4 + 2 * Math.ceil((4 * width) / 127);
    if (byteLength < height * minRleScanlineBytes) {
      throw "HDRDecoder: truncated RLE pixel data";
    }

    const dataRGBA = new Uint8Array(expectedBytes);
    let offset = 0;
    let pos = 0;
    const ptrEnd = 4 * width;
    const scanLineBuffer = new Uint8Array(ptrEnd);
    let numScanLines = height;

    while (numScanLines > 0) {
      if (pos + 4 > byteLength) throw "HDRDecoder: truncated scanline header";
      const a = buffer[pos++];
      const b = buffer[pos++];
      const c = buffer[pos++];
      const d = buffer[pos++];

      if (a !== 2 || b !== 2 || c & 0x80 || ((c << 8) | d) !== width) {
        throw "HDRDecoder: wrong scanline width";
      }

      let ptr = 0;
      while (ptr < ptrEnd) {
        if (pos >= byteLength) throw "HDRDecoder: truncated scanline data";
        let count = buffer[pos++];
        const isEncodedRun = count > 128;
        if (isEncodedRun) count -= 128;

        if (count === 0 || ptr + count > ptrEnd) throw "HDRDecoder: bad scanline data";

        if (isEncodedRun) {
          if (pos >= byteLength) throw "HDRDecoder: truncated scanline run value";
          const byteValue = buffer[pos++];
          for (let i = 0; i < count; i++) scanLineBuffer[ptr++] = byteValue;
        } else {
          if (pos + count > byteLength) throw "HDRDecoder: truncated scanline literal run";
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

  private static _readStringLine(uint8array: Uint8Array, startIndex: number): string {
    let line = "";
    const limit = Math.min(uint8array.length, startIndex + MAX_HDR_LINE_LENGTH);
    for (let i = startIndex; i < limit; i++) {
      const character = String.fromCharCode(uint8array[i]);
      if (character === "\n") break;
      line += character;
    }
    return line;
  }
}

export interface IHDRHeader {
  width: number;
  height: number;
  dataPosition: number;
}
