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
  private static _one = 0x3c00; // Half float for 1.0

  // prettier-ignore
  private static _faces = [ // Cubemap face corners [bottomLeft, bottomRight, topLeft, topRight] as flat xyz
    /* +X */ [ 1,-1,-1,  1,-1, 1,  1, 1,-1,  1, 1, 1],
    /* -X */ [-1,-1, 1, -1,-1,-1, -1, 1, 1, -1, 1,-1],
    /* +Y */ [-1,-1, 1,  1,-1, 1, -1,-1,-1,  1,-1,-1],
    /* -Y */ [-1, 1,-1,  1, 1,-1, -1, 1, 1,  1, 1, 1],
    /* +Z */ [-1,-1,-1,  1,-1,-1, -1, 1,-1,  1, 1,-1],
    /* -Z */ [ 1,-1, 1, -1,-1, 1,  1, 1, 1, -1, 1, 1]
  ];

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

  static decode(buffer: ArrayBuffer): { cubeSize: number; faceBuffers: Uint16Array[] } {
    const bufferArray = new Uint8Array(buffer);
    const { width, height, dataPosition } = HDRDecoder._parseHeader(bufferArray);
    const cubeSize = height >> 1;
    const pixels = HDRDecoder._readPixels(bufferArray.subarray(dataPosition), width, height);

    const faces = HDRDecoder._faces;
    const faceBuffers: Uint16Array[] = [];
    for (let faceIndex = 0; faceIndex < 6; faceIndex++) {
      faceBuffers[faceIndex] = HDRDecoder._createCubemapData(cubeSize, faces[faceIndex], pixels, width, height);
    }
    return { cubeSize, faceBuffers };
  }

  private static _createCubemapData(
    texSize: number,
    face: number[],
    pixels: Uint8Array,
    inputWidth: number,
    inputHeight: number
  ): Uint16Array {
    const facePixels = new Uint16Array(texSize * texSize * 4);
    const invSize = 1 / texSize;
    const rotDX1X = (face[3] - face[0]) * invSize;
    const rotDX1Y = (face[4] - face[1]) * invSize;
    const rotDX1Z = (face[5] - face[2]) * invSize;
    const rotDX2X = (face[9] - face[6]) * invSize;
    const rotDX2Y = (face[10] - face[7]) * invSize;
    const rotDX2Z = (face[11] - face[8]) * invSize;

    const floatView = HDRDecoder._floatView;
    const uint32View = HDRDecoder._uint32View;
    const { baseTable, shiftTable } = HDRDecoder._float2HalfTables;
    const one = HDRDecoder._one;

    let fy = 0;
    for (let y = 0; y < texSize; y++) {
      let xv1X = face[0],
        xv1Y = face[1],
        xv1Z = face[2];
      let xv2X = face[6],
        xv2Y = face[7],
        xv2Z = face[8];

      for (let x = 0; x < texSize; x++) {
        let dirX = xv1X + (xv2X - xv1X) * fy;
        let dirY = xv1Y + (xv2Y - xv1Y) * fy;
        let dirZ = xv1Z + (xv2Z - xv1Z) * fy;
        const invLen = 1 / Math.sqrt(dirX * dirX + dirY * dirY + dirZ * dirZ);
        dirX *= invLen;
        dirY *= invLen;
        dirZ *= invLen;

        let px = Math.round(((Math.atan2(dirZ, dirX) / Math.PI) * 0.5 + 0.5) * inputWidth);
        if (px < 0) px = 0;
        else if (px >= inputWidth) px = inputWidth - 1;

        let py = Math.round((Math.acos(dirY) / Math.PI) * inputHeight);
        if (py < 0) py = 0;
        else if (py >= inputHeight) py = inputHeight - 1;

        const srcIndex = (inputHeight - py - 1) * inputWidth * 4 + px * 4;
        const scaleFactor = Math.pow(2, pixels[srcIndex + 3] - 128) / 255;
        const dstIndex = y * texSize * 4 + x * 4;

        for (let c = 0; c < 3; c++) {
          floatView[0] = pixels[srcIndex + c] * scaleFactor;
          const f = uint32View[0];
          const e = (f >> 23) & 0x1ff;
          facePixels[dstIndex + c] = baseTable[e] + ((f & 0x007fffff) >> shiftTable[e]);
        }
        facePixels[dstIndex + 3] = one;

        xv1X += rotDX1X;
        xv1Y += rotDX1Y;
        xv1Z += rotDX1Z;
        xv2X += rotDX2X;
        xv2Y += rotDX2Y;
        xv2Z += rotDX2Z;
      }
      fy += invSize;
    }
    return facePixels;
  }

  private static _readStringLine(uint8array: Uint8Array, startIndex: number): string {
    let line = "";
    for (let i = startIndex, n = uint8array.length - startIndex; i < n; i++) {
      const character = String.fromCharCode(uint8array[i]);
      if (character === "\n") break;
      line += character;
    }
    return line;
  }

  private static _parseHeader(uint8array: Uint8Array): IHDRHeader {
    let line = this._readStringLine(uint8array, 0);
    if (line[0] !== "#" || line[1] !== "?") {
      throw "HDRDecoder: invalid file header";
    }

    let endOfHeader = false;
    let findFormat = false;
    let lineIndex = 0;

    do {
      lineIndex += line.length + 1;
      line = this._readStringLine(uint8array, lineIndex);
      if (line === "FORMAT=32-bit_rle_rgbe") findFormat = true;
      else if (line.length === 0) endOfHeader = true;
    } while (!endOfHeader);

    if (!findFormat) {
      throw "HDRDecoder: unsupported format, expected 32-bit_rle_rgbe";
    }

    lineIndex += line.length + 1;
    line = this._readStringLine(uint8array, lineIndex);

    const match = /^\-Y (.*) \+X (.*)$/g.exec(line);
    if (!match || match.length < 3) {
      throw "HDRDecoder: missing image size, only -Y +X layout is supported";
    }
    const width = parseInt(match[2]);
    const height = parseInt(match[1]);

    if (width < 8 || width > 0x7fff) {
      throw "HDRDecoder: unsupported image width, must be between 8 and 32767";
    }

    return { height, width, dataPosition: lineIndex + line.length + 1 };
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

      if (a !== 2 || b !== 2 || c & 0x80 || width < 8 || width > 32767) return buffer;

      if (((c << 8) | d) !== width) throw "HDRDecoder: wrong scanline width";

      let ptr = 0;
      while (ptr < ptrEnd && pos < byteLength) {
        let count = buffer[pos++];
        const isEncodedRun = count > 128;
        if (isEncodedRun) count -= 128;

        if (count === 0 || ptr + count > ptrEnd) throw "HDRDecoder: bad scanline data";

        if (isEncodedRun) {
          const byteValue = buffer[pos++];
          for (let i = 0; i < count; i++) scanLineBuffer[ptr++] = byteValue;
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
