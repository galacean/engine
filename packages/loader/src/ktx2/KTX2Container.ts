import { Utils } from "@galacean/engine-core";
import { BufferReader } from "../resource-deserialize/utils/BufferReader";
import { KHR_DF_SAMPLE_DATATYPE_SIGNED, SupercompressionScheme } from "./constants";

enum DFDTransferFunction {
  linear = 1,
  sRGB = 2
}

enum ColorModel {
  ETC1S = 163,
  UASTC = 166
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

  constructor(buffer: ArrayBuffer) {
    this.parse(buffer);
  }

  get isSRGB() {
    return this.dataFormatDescriptor.transferFunction === DFDTransferFunction.sRGB;
  }

  get isUASTC() {
    return this.dataFormatDescriptor.colorModel === ColorModel.UASTC;
  }

  private parse(buffer: ArrayBuffer) {
    const headerBufferReader = new BufferReader(buffer, 12, 68);
    // vk format 在 vulkan 中的纹理格式，对应的是 vulkan api，在 webgl/opengl 中无法使用
    this.vkFormat = headerBufferReader.nextUint32();
    // 数据类型每个单元上传到 GPU 的 size, 如果是 R8G8B8A8，那么 typeSize 就是 1，R16G16B16A16，typeSize 就是 2，对解析帮助不大
    this.typeSize = headerBufferReader.nextUint32();
    this.pixelWidth = headerBufferReader.nextUint32();
    this.pixelHeight = headerBufferReader.nextUint32();

    // 3D 纹理深度，引擎目前不支持 3D 纹理，一般都是 1
    this.pixelDepth = headerBufferReader.nextUint32();
    // 纹理数组的大小，如果是纹理数组则会用到这个
    this.layerCount = headerBufferReader.nextUint32();
    // cubemap 的 faceCount，要么是 1，要么是 6
    this.faceCount = headerBufferReader.nextUint32();
    // Mipmap 等级数量
    const levelCount = Math.max(1, headerBufferReader.nextUint32());
    // 用来标识是否用到超压缩纹理，如果是 0 就没用到，
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
    const levelReader = new BufferReader(buffer, headerBufferReader.offset, levelByteLength, true);
    this.levels = ktxLevels;

    for (let i = 0; i < levelCount; i++) {
      ktxLevels[i] = {
        levelData: new Uint8Array(buffer, levelReader.nextUint64(), levelReader.nextUint64()),
        uncompressedByteLength: levelReader.nextUint64()
      };
    }
    // Data Format Descriptor (DFD).
    const dfdReader = new BufferReader(buffer, dfdByteOffset, dfdByteLength, true);

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

      if (sample.channelType & KHR_DF_SAMPLE_DATATYPE_SIGNED) {
        sample.sampleLower = dfdReader.nextInt32();
        sample.sampleUpper = dfdReader.nextInt32();
      } else {
        sample.sampleLower = dfdReader.nextUint32();
        sample.sampleUpper = dfdReader.nextUint32();
      }

      dfd.samples[i] = sample;
    }

    const kvdReader = new BufferReader(buffer, kvdByteOffset, kvdByteLength, true);

    while (kvdReader.relativeOffset < kvdByteLength) {
      const keyValueByteLength = kvdReader.nextUint32();
      const keyData = kvdReader.scan(keyValueByteLength);
      const key = Utils.decodeText(keyData);

      // 4-byte alignment.
      const kvPadding = keyValueByteLength % 4 ? 4 - (keyValueByteLength % 4) : 0;
      const valueData = kvdReader.nextUint8Array(keyValueByteLength - keyData.byteLength - 2);
      this.keyValue[key] = key.match(/^ktx/i) ? Utils.decodeText(valueData) : valueData;
      kvdReader.skip(kvPadding + 1);
    }

    if (sgdByteLength <= 0) return this;

    const sgdReader = new BufferReader(buffer, sgdByteOffset, sgdByteLength, true);

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

    const endpointsByteOffset = sgdByteOffset + sgdReader.offset;
    const selectorsByteOffset = endpointsByteOffset + endpointsByteLength;
    const tablesByteOffset = selectorsByteOffset + selectorsByteLength;
    const extendedByteOffset = tablesByteOffset + tablesByteLength;

    const endpointsData = new Uint8Array(buffer, endpointsByteOffset, endpointsByteLength);
    const selectorsData = new Uint8Array(buffer, selectorsByteOffset, selectorsByteLength);
    const tablesData = new Uint8Array(buffer, tablesByteOffset, tablesByteLength);
    const extendedData = new Uint8Array(buffer, extendedByteOffset, extendedByteLength);

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

export interface KTX2Level {
  levelData: Uint8Array;
  uncompressedByteLength: number;
}

export interface KTX2DataFormatDescriptorBasicFormat {
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

export interface KTX2BasicFormatSample {
  bitOffset: number;
  bitLength: number;
  /** @deprecated Renamed to 'channelType'. */
  channelID?: number;
  channelType: number;
  samplePosition: number[];
  sampleLower: number;
  sampleUpper: number;
}

export interface KTX2GlobalDataBasisLZ {
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
