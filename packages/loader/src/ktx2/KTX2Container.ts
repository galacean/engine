import { Utils } from "@galacean/engine-core";
import { BufferReader } from "../resource-deserialize/utils/BufferReader";

export enum DFDTransferFunction {
  linear = 1,
  sRGB = 2
}

export enum ColorModel {
  ETC1S = 163,
  UASTC_LDR_4X4 = 166,
  UASTC_HDR_4X4 = 167
}

export enum SupercompressionScheme {
  None,
  BasisLZ,
  Zstd,
  ZLib
}

const KTX2_IDENTIFIER = [0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a];
const KTX2_HEADER_BYTE_LENGTH = 80;
const KTX2_LEVEL_INDEX_ENTRY_BYTES = 24;
const KTX2_DFD_HEADER_BYTES = 24;
const KTX2_SGD_HEADER_BYTES = 20;
const KTX2_SGD_IMAGE_DESC_BYTES = 20;

function ensureRange(offset: number, length: number, totalByteLength: number, label: string): void {
  if (
    !Number.isSafeInteger(offset) ||
    !Number.isSafeInteger(length) ||
    offset < 0 ||
    length < 0 ||
    offset > totalByteLength ||
    length > totalByteLength - offset
  ) {
    throw new Error(`KTX2Container: ${label} exceeds buffer bounds.`);
  }
}

/** @internal */
export class KTX2Container {
  static checkMagic(buffer: ArrayBuffer, offset: number = 0): boolean {
    if (buffer.byteLength < offset + 4) return false;
    const id = new Uint8Array(buffer, offset, 4);
    return id[0] === 0xab && id[1] === 0x4b && id[2] === 0x54 && id[3] === 0x58;
  }

  vkFormat = 0;

  typeSize = 1;

  pixelWidth = 0;

  pixelHeight = 0;

  pixelDepth = 0;

  layerCount = 0;

  faceCount = 1;

  supercompressionScheme: SupercompressionScheme = SupercompressionScheme.None;

  levels: KTX2Level[] = [];

  dataFormatDescriptor: KTX2DataFormatDescriptorBasicFormat;

  keyValue: { [key: string]: string | Uint8Array } = Object.create(null);

  globalData: KTX2GlobalDataBasisLZ | null = null;

  constructor(buffer: Uint8Array) {
    this.parse(buffer);
  }

  get isSRGB() {
    return this.dataFormatDescriptor.transferFunction === DFDTransferFunction.sRGB;
  }

  get colorModel(): ColorModel {
    return this.dataFormatDescriptor.colorModel;
  }

  private parse(data: Uint8Array) {
    const dataByteLength = data.byteLength;
    if (dataByteLength < KTX2_HEADER_BYTE_LENGTH) {
      throw new Error("KTX2Container: buffer shorter than KTX2 header.");
    }
    for (let i = 0; i < KTX2_IDENTIFIER.length; i++) {
      if (data[i] !== KTX2_IDENTIFIER[i]) {
        throw new Error("KTX2Container: invalid KTX2 file identifier.");
      }
    }

    const buffer = data.buffer;
    const byteOffset = data.byteOffset;
    const headerBufferReader = new BufferReader(data, 12, KTX2_HEADER_BYTE_LENGTH - 12);
    this.vkFormat = headerBufferReader.nextUint32();
    this.typeSize = headerBufferReader.nextUint32();
    this.pixelWidth = headerBufferReader.nextUint32();
    this.pixelHeight = headerBufferReader.nextUint32();

    this.pixelDepth = headerBufferReader.nextUint32();
    this.layerCount = headerBufferReader.nextUint32();
    this.faceCount = headerBufferReader.nextUint32();

    const levelCount = Math.max(1, headerBufferReader.nextUint32());
    this.supercompressionScheme = headerBufferReader.nextUint32();

    const dfdByteOffset = headerBufferReader.nextUint32();
    const dfdByteLength = headerBufferReader.nextUint32();

    const kvdByteOffset = headerBufferReader.nextUint32();
    const kvdByteLength = headerBufferReader.nextUint32();

    const sgdByteOffset = headerBufferReader.nextUint64();
    const sgdByteLength = headerBufferReader.nextUint64();

    if (this.pixelWidth === 0 || this.faceCount === 0) {
      throw new Error("KTX2Container: invalid texture dimensions or faceCount.");
    }
    const maxDimension = Math.max(this.pixelWidth, this.pixelHeight, this.pixelDepth);
    const maxLevelCount = Math.floor(Math.log2(maxDimension)) + 1;
    if (levelCount <= 0 || levelCount > maxLevelCount) {
      throw new Error(`KTX2Container: levelCount ${levelCount} exceeds maximum ${maxLevelCount}.`);
    }

    // level index
    const levelByteLength = levelCount * KTX2_LEVEL_INDEX_ENTRY_BYTES;
    ensureRange(headerBufferReader.offset, levelByteLength, dataByteLength, "level index");
    const levelReader = new BufferReader(data, headerBufferReader.offset, levelByteLength);
    const ktxLevels = new Array<KTX2Level>(levelCount);
    this.levels = ktxLevels;

    for (let i = 0; i < levelCount; i++) {
      const levelOffset = levelReader.nextUint64();
      const levelLength = levelReader.nextUint64();
      const uncompressedByteLength = levelReader.nextUint64();
      ensureRange(levelOffset, levelLength, dataByteLength, `level[${i}]`);
      ktxLevels[i] = {
        levelData: new Uint8Array(buffer, byteOffset + levelOffset, levelLength),
        uncompressedByteLength
      };
    }

    // Data Format Descriptor (DFD).
    ensureRange(dfdByteOffset, dfdByteLength, dataByteLength, "DFD");
    if (dfdByteLength < KTX2_DFD_HEADER_BYTES) {
      throw new Error("KTX2Container: DFD shorter than basic header.");
    }
    const dfdReader = new BufferReader(data, dfdByteOffset, dfdByteLength);

    const dfd: KTX2DataFormatDescriptorBasicFormat = {
      vendorId: dfdReader.skip(4 /* totalSize */).nextUint16(),
      descriptorType: dfdReader.nextUint16(),
      versionNumber: dfdReader.nextUint16(),
      descriptorBlockSize: dfdReader.nextUint16(),
      colorModel: dfdReader.nextUint8(),
      colorPrimaries: dfdReader.nextUint8(),
      transferFunction: dfdReader.nextUint8(),
      flags: dfdReader.nextUint8(),
      texelBlockDimension: [dfdReader.nextUint8(), dfdReader.nextUint8(), dfdReader.nextUint8(), dfdReader.nextUint8()],
      bytesPlane: [
        dfdReader.nextUint8(),
        dfdReader.nextUint8(),
        dfdReader.nextUint8(),
        dfdReader.nextUint8(),
        dfdReader.nextUint8(),
        dfdReader.nextUint8(),
        dfdReader.nextUint8(),
        dfdReader.nextUint8()
      ],
      samples: []
    };

    this.dataFormatDescriptor = dfd;

    const sampleStart = 6;
    const sampleWords = 4;
    const numSamples = (dfd.descriptorBlockSize / 4 - sampleStart) / sampleWords;
    if (!Number.isInteger(numSamples) || numSamples < 0 || KTX2_DFD_HEADER_BYTES + numSamples * 16 > dfdByteLength) {
      throw new Error("KTX2Container: invalid DFD sample count.");
    }

    for (let i = 0; i < numSamples; i++) {
      const sample = {
        bitOffset: dfdReader.nextUint16(),
        bitLength: dfdReader.nextUint8(),
        channelType: dfdReader.nextUint8(),
        samplePosition: [dfdReader.nextUint8(), dfdReader.nextUint8(), dfdReader.nextUint8(), dfdReader.nextUint8()],
        sampleLower: -Infinity,
        sampleUpper: Infinity
      };

      if (sample.channelType & 0x40) {
        sample.sampleLower = dfdReader.nextInt32();
        sample.sampleUpper = dfdReader.nextInt32();
      } else {
        sample.sampleLower = dfdReader.nextUint32();
        sample.sampleUpper = dfdReader.nextUint32();
      }

      dfd.samples[i] = sample;
    }

    ensureRange(kvdByteOffset, kvdByteLength, dataByteLength, "KVD");
    const kvdReader = new BufferReader(data, kvdByteOffset, kvdByteLength, true);

    while (kvdReader.position < kvdByteLength) {
      const keyValueByteLength = kvdReader.nextUint32();
      if (keyValueByteLength > kvdReader.remaining) {
        throw new Error("KTX2Container: KVD entry exceeds bounds.");
      }
      const keyData = kvdReader.scan(keyValueByteLength);
      if (keyData.byteLength >= keyValueByteLength) {
        throw new Error("KTX2Container: KVD key missing null terminator.");
      }
      const key = Utils.decodeText(keyData);

      // 4-byte alignment.
      const valueData = kvdReader.nextUint8Array(keyValueByteLength - keyData.byteLength - 1);
      this.keyValue[key] = key.match(/^ktx/i) ? Utils.decodeText(valueData).replace(/^(.*)\x00$/, "$1") : valueData;

      const kvPadding = keyValueByteLength % 4 ? 4 - (keyValueByteLength % 4) : 0; // align(4)
      // 4-byte alignment.
      if (kvPadding > kvdReader.remaining) {
        throw new Error("KTX2Container: KVD padding exceeds bounds.");
      }
      kvdReader.skip(kvPadding);
    }

    if (sgdByteLength <= 0) return this;

    ensureRange(sgdByteOffset, sgdByteLength, dataByteLength, "SGD");
    if (sgdByteLength < KTX2_SGD_HEADER_BYTES + levelCount * KTX2_SGD_IMAGE_DESC_BYTES) {
      throw new Error("KTX2Container: SGD shorter than required header and image descriptors.");
    }
    const sgdReader = new BufferReader(data, sgdByteOffset, sgdByteLength, true);

    const endpointCount = sgdReader.nextUint16();
    const selectorCount = sgdReader.nextUint16();
    const endpointsByteLength = sgdReader.nextUint32();
    const selectorsByteLength = sgdReader.nextUint32();
    const tablesByteLength = sgdReader.nextUint32();
    const extendedByteLength = sgdReader.nextUint32();

    const imageDescs: KTX2GlobalDataBasisLZImageDesc[] = new Array(levelCount);

    for (let i = 0; i < levelCount; i++) {
      imageDescs[i] = {
        imageFlags: sgdReader.nextUint32(),
        rgbSliceByteOffset: sgdReader.nextUint32(),
        rgbSliceByteLength: sgdReader.nextUint32(),
        alphaSliceByteOffset: sgdReader.nextUint32(),
        alphaSliceByteLength: sgdReader.nextUint32()
      };
    }

    const endpointsByteOffset = sgdByteOffset + sgdReader.position;
    const selectorsByteOffset = endpointsByteOffset + endpointsByteLength;
    const tablesByteOffset = selectorsByteOffset + selectorsByteLength;
    const extendedByteOffset = tablesByteOffset + tablesByteLength;
    const sgdEndOffset = sgdByteOffset + sgdByteLength;
    ensureRange(endpointsByteOffset, endpointsByteLength, sgdEndOffset, "SGD endpoints");
    ensureRange(selectorsByteOffset, selectorsByteLength, sgdEndOffset, "SGD selectors");
    ensureRange(tablesByteOffset, tablesByteLength, sgdEndOffset, "SGD tables");
    ensureRange(extendedByteOffset, extendedByteLength, sgdEndOffset, "SGD extended");

    const endpointsData = new Uint8Array(buffer, byteOffset + endpointsByteOffset, endpointsByteLength);
    const selectorsData = new Uint8Array(buffer, byteOffset + selectorsByteOffset, selectorsByteLength);
    const tablesData = new Uint8Array(buffer, byteOffset + tablesByteOffset, tablesByteLength);
    const extendedData = new Uint8Array(buffer, byteOffset + extendedByteOffset, extendedByteLength);

    this.globalData = {
      endpointCount,
      selectorCount,
      imageDescs,
      endpointsData,
      selectorsData,
      tablesData,
      extendedData
    };
  }
}

interface KTX2Level {
  levelData: Uint8Array;
  uncompressedByteLength: number;
}

interface KTX2DataFormatDescriptorBasicFormat {
  vendorId: number;
  descriptorType: number;
  versionNumber: number;
  /** @deprecated Inferred. */
  descriptorBlockSize: number;
  colorModel: number;
  colorPrimaries: number;
  transferFunction: number;
  flags: number;
  texelBlockDimension: [number, number, number, number];
  bytesPlane: [number, number, number, number, number, number, number, number];
  samples: KTX2BasicFormatSample[];
}

interface KTX2BasicFormatSample {
  bitOffset: number;
  bitLength: number;
  /** @deprecated Renamed to 'channelType'. */
  channelID?: number;
  channelType: number;
  samplePosition: number[];
  sampleLower: number;
  sampleUpper: number;
}

interface KTX2GlobalDataBasisLZ {
  endpointCount: number;
  selectorCount: number;
  imageDescs: KTX2GlobalDataBasisLZImageDesc[];
  endpointsData: Uint8Array;
  selectorsData: Uint8Array;
  tablesData: Uint8Array;
  extendedData: Uint8Array;
}

interface KTX2GlobalDataBasisLZImageDesc {
  imageFlags: number;
  rgbSliceByteOffset: number;
  rgbSliceByteLength: number;
  alphaSliceByteOffset: number;
  alphaSliceByteLength: number;
}
