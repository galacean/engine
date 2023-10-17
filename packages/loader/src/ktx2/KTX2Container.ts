import { Utils } from "@galacean/engine-core";
import { BufferReader } from "../resource-deserialize/utils/BufferReader";

enum DFDTransferFunction {
  linear = 1,
  sRGB = 2
}

enum ColorModel {
  ETC1S = 163,
  UASTC = 166
}

export enum SupercompressionScheme {
  None,
  BasisLZ,
  Zstd,
  ZLib
}

/** @internal */
export class KTX2Container {
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

  keyValue: { [key: string]: string | Uint8Array } = {};

  globalData: KTX2GlobalDataBasisLZ | null = null;

  constructor(buffer: Uint8Array) {
    this.parse(buffer);
  }

  get isSRGB() {
    return this.dataFormatDescriptor.transferFunction === DFDTransferFunction.sRGB;
  }

  get isUASTC() {
    return this.dataFormatDescriptor.colorModel === ColorModel.UASTC;
  }

  private parse(data: Uint8Array) {
    const buffer = data.buffer;
    const byteOffset = data.byteOffset;
    const headerBufferReader = new BufferReader(data, 12);
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

    // level index
    const ktxLevels = new Array<KTX2Level>(levelCount);
    const levelByteLength = levelCount * 3 * 8;
    const levelReader = new BufferReader(data, headerBufferReader.offset, levelByteLength);
    this.levels = ktxLevels;

    for (let i = 0; i < levelCount; i++) {
      ktxLevels[i] = {
        levelData: new Uint8Array(buffer, byteOffset + levelReader.nextUint64(), levelReader.nextUint64()),
        uncompressedByteLength: levelReader.nextUint64()
      };
    }
    // Data Format Descriptor (DFD).
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

    const kvdReader = new BufferReader(data, kvdByteOffset, kvdByteLength, true);

    while (kvdReader.position < kvdByteLength) {
      const keyValueByteLength = kvdReader.nextUint32();
      const keyData = kvdReader.scan(keyValueByteLength);
      const key = Utils.decodeText(keyData);

      // 4-byte alignment.
      const valueData = kvdReader.nextUint8Array(keyValueByteLength - keyData.byteLength - 1);
      this.keyValue[key] = key.match(/^ktx/i) ? Utils.decodeText(valueData).replace(/^(.*)\x00$/, "$1") : valueData;

      const kvPadding = keyValueByteLength % 4 ? 4 - (keyValueByteLength % 4) : 0; // align(4)
      // 4-byte alignment.
      kvdReader.skip(kvPadding);
    }

    if (sgdByteLength <= 0) return this;

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
