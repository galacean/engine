import {
  AssetPromise,
  AssetType,
  ContentRestorer,
  Engine,
  EngineConfiguration,
  GLCapabilityType,
  LoadItem,
  Loader,
  Logger,
  RequestConfig,
  ResourceManager,
  Texture2D,
  TextureCube,
  TextureCubeFace,
  TextureFormat,
  resourceLoader
} from "@galacean/engine-core";
import { MathUtil } from "@galacean/engine-math";
import { ColorModel, DFDTransferFunction, KTX2Container, SupercompressionScheme } from "./KTX2Container";
import { KTX2TargetFormat } from "./KTX2TargetFormat";
import { TranscodeResult } from "./transcoder/AbstractTranscoder";
import { BinomialLLCTranscoder } from "./transcoder/BinomialLLCTranscoder";

const nativeFormats = {
  70: { format: TextureFormat.R16_UNORM, channels: 1, typeSize: 2 },
  76: { format: TextureFormat.R16, channels: 1, typeSize: 2 },
  83: { format: TextureFormat.R16G16, channels: 2, typeSize: 2 },
  100: { format: TextureFormat.R32, channels: 1, typeSize: 4 },
  103: { format: TextureFormat.R32G32, channels: 2, typeSize: 4 }
};

@resourceLoader(AssetType.KTX2, ["ktx2"])
export class KTX2Loader extends Loader<Texture2D | TextureCube> {
  private static _binomialLLCTranscoder: BinomialLLCTranscoder | null;
  private static _priorityFormats = {
    [ColorModel.ETC1S]: [
      KTX2TargetFormat.ETC,
      KTX2TargetFormat.BC7,
      KTX2TargetFormat.ASTC,
      KTX2TargetFormat.BC1_BC3,
      KTX2TargetFormat.PVRTC
    ],
    [ColorModel.UASTC_LDR_4X4]: [
      KTX2TargetFormat.ASTC,
      KTX2TargetFormat.BC7,
      KTX2TargetFormat.ETC,
      KTX2TargetFormat.BC1_BC3,
      KTX2TargetFormat.PVRTC
    ],
    [ColorModel.UASTC_HDR_4X4]: [KTX2TargetFormat.ASTC_HDR_4x4, KTX2TargetFormat.BC6H, KTX2TargetFormat.R16G16B16A16]
  };
  private static _capabilityMap = {
    [KTX2TargetFormat.ASTC]: {
      [DFDTransferFunction.linear]: [GLCapabilityType.astc, GLCapabilityType.astc_webkit],
      [DFDTransferFunction.sRGB]: [GLCapabilityType.astc, GLCapabilityType.astc_webkit]
    },
    [KTX2TargetFormat.ETC]: {
      [DFDTransferFunction.linear]: [GLCapabilityType.etc, GLCapabilityType.etc_webkit],
      [DFDTransferFunction.sRGB]: [GLCapabilityType.etc, GLCapabilityType.etc_webkit]
    },
    [KTX2TargetFormat.BC7]: {
      [DFDTransferFunction.linear]: [GLCapabilityType.bptc],
      [DFDTransferFunction.sRGB]: [GLCapabilityType.bptc]
    },
    [KTX2TargetFormat.BC1_BC3]: {
      [DFDTransferFunction.linear]: [GLCapabilityType.s3tc],
      [DFDTransferFunction.sRGB]: [GLCapabilityType.s3tc_srgb]
    },
    [KTX2TargetFormat.BC6H]: {
      [DFDTransferFunction.linear]: [GLCapabilityType.bptc]
    },
    [KTX2TargetFormat.ASTC_HDR_4x4]: {
      [DFDTransferFunction.linear]: [GLCapabilityType.astc_hdr]
    },
    [KTX2TargetFormat.R16G16B16A16]: {
      [DFDTransferFunction.linear]: [GLCapabilityType.textureHalfFloat]
    },
    [KTX2TargetFormat.PVRTC]: { [DFDTransferFunction.linear]: [GLCapabilityType.pvrtc, GLCapabilityType.pvrtc_webkit] }
  };

  /**
   * Release ktx2 transcoder worker.
   * @remarks If use loader after releasing, we should release again.
   */
  static release(): void {
    if (this._binomialLLCTranscoder) this._binomialLLCTranscoder.destroy();
    this._binomialLLCTranscoder = null;
  }

  /** @internal */
  static _parseBuffer(
    buffer: Uint8Array,
    engine: Engine,
    params?: KTX2Params,
    ktx2Container = new KTX2Container(buffer)
  ) {
    const defaultFormats = KTX2Loader._priorityFormats[ktx2Container.colorModel];
    if (!defaultFormats) {
      throw new Error(
        `Unsupported KTX2 format (vkFormat=${ktx2Container.vkFormat}, DFD model=${ktx2Container.colorModel})`
      );
    }
    const formatPriorities = params?.priorityFormats ?? defaultFormats;
    const targetFormat = KTX2Loader._decideTargetFormat(engine, ktx2Container, formatPriorities);
    const binomialLLCWorker = KTX2Loader._getBinomialLLCTranscoder();
    return binomialLLCWorker
      .init()
      .then(() => binomialLLCWorker.transcode(buffer, targetFormat))
      .then((result) => {
        return {
          ktx2Container,
          engine,
          result,
          targetFormat,
          params: ktx2Container.keyValue["GalaceanTextureParams"] as Uint8Array
        };
      });
  }

  /** @internal */
  static _createTextureByBuffer(
    engine: Engine,
    isSRGB: boolean,
    transcodeResult: TranscodeResult,
    targetFormat: KTX2TargetFormat,
    params?: Uint8Array,
    restoredTexture?: Texture2D | TextureCube
  ): Texture2D | TextureCube {
    const { width, height, faces } = transcodeResult;
    const faceCount = faces.length;
    const mipmaps = faces[0];
    const mipmap = mipmaps.length > 1;
    const engineFormat = this._getEngineTextureFormat(targetFormat, transcodeResult);
    let texture: Texture2D | TextureCube;
    if (faceCount !== 6) {
      texture = restoredTexture || new Texture2D(engine, width, height, engineFormat, mipmap, isSRGB);
      for (let mipLevel = 0; mipLevel < mipmaps.length; mipLevel++) {
        const { data } = mipmaps[mipLevel];
        (<Texture2D>texture).setPixelBuffer(data, mipLevel);
      }
    } else {
      texture = restoredTexture || new TextureCube(engine, height, engineFormat, mipmap, isSRGB);
      for (let i = 0; i < faces.length; i++) {
        const faceData = faces[i];
        for (let mipLevel = 0; mipLevel < mipmaps.length; mipLevel++) {
          (<TextureCube>texture).setPixelBuffer(TextureCubeFace.PositiveX + i, faceData[mipLevel].data, mipLevel);
        }
      }
    }
    this._applyTextureParams(texture, params);
    return texture as Texture2D | TextureCube;
  }

  /** @internal */
  static async _loadTextureFromBuffer(
    buffer: ArrayBuffer,
    engine: Engine,
    params?: KTX2Params,
    restoredTexture?: Texture2D | TextureCube
  ): Promise<Texture2D | TextureCube> {
    const bytes = new Uint8Array(buffer);
    const container = new KTX2Container(bytes);
    if (nativeFormats[container.vkFormat]) {
      if (restoredTexture && !(restoredTexture instanceof Texture2D)) {
        throw new Error("Cannot restore a KTX2 native image into a cube texture");
      }
      return this._uploadNativeTexture(container, engine, restoredTexture);
    }
    const parsed = await this._parseBuffer(bytes, engine, params, container);
    return this._createTextureByBuffer(
      engine,
      container.isSRGB,
      parsed.result,
      parsed.targetFormat,
      parsed.params,
      restoredTexture
    );
  }

  private static _uploadNativeTexture(
    container: KTX2Container,
    engine: Engine,
    restoredTexture?: Texture2D
  ): Texture2D {
    const { pixelWidth: width, pixelHeight: height, levels } = container;
    const { format, channels, typeSize } = nativeFormats[container.vkFormat];
    if (
      !width ||
      !height ||
      container.pixelDepth !== 0 ||
      container.layerCount !== 0 ||
      container.faceCount !== 1 ||
      container.typeSize !== typeSize ||
      container.isSRGB ||
      container.supercompressionScheme !== SupercompressionScheme.None
    ) {
      throw new Error("KTX2 native requires an unsupercompressed, linear 2D texture");
    }
    const fullMipCount = Math.floor(Math.log2(Math.max(width, height))) + 1;
    // Texture2D allocates either the base level or the complete mip chain.
    if (container.generateMipmaps || (levels.length !== 1 && levels.length !== fullMipCount)) {
      throw new Error("KTX2 native requires one explicit level or a complete mip chain");
    }
    const mipData = levels.map(({ levelData, uncompressedByteLength }, level) => {
      const texelCount = Math.max(1, Math.floor(width / 2 ** level)) * Math.max(1, Math.floor(height / 2 ** level));
      if (
        levelData.byteOffset % typeSize ||
        levelData.byteLength !== texelCount * channels * typeSize ||
        levelData.byteLength !== uncompressedByteLength
      ) {
        throw new Error(`Invalid KTX2 native data at mip level ${level}`);
      }
      const ArrayType = typeSize === 2 ? Uint16Array : Float32Array;
      return new ArrayType(levelData.buffer, levelData.byteOffset, texelCount * channels);
    });
    if (
      restoredTexture &&
      (restoredTexture.format !== format ||
        restoredTexture.width !== width ||
        restoredTexture.height !== height ||
        restoredTexture.mipmapCount !== levels.length)
    ) {
      throw new Error("KTX2 native image does not match the texture being restored");
    }
    const texture = restoredTexture ?? new Texture2D(engine, width, height, format, levels.length > 1, false);
    for (let level = 0; level < mipData.length; level++) {
      texture.setPixelBuffer(mipData[level], level);
    }
    this._applyTextureParams(texture, container.keyValue["GalaceanTextureParams"] as Uint8Array);
    return texture;
  }

  private static _applyTextureParams(texture: Texture2D | TextureCube, params?: Uint8Array): void {
    if (params) {
      texture.wrapModeU = params[0];
      texture.wrapModeV = params[1];
      texture.filterMode = params[2];
      texture.anisoLevel = params[3];
    }
  }

  private static _decideTargetFormat(
    engine: Engine,
    ktx2Container: KTX2Container,
    priorityFormats?: KTX2TargetFormat[]
  ): KTX2TargetFormat {
    const renderer = (engine as any)._hardwareRenderer;
    const { isSRGB, pixelWidth, pixelHeight } = ktx2Container;
    const targetFormat = this._detectSupportedFormat(renderer, priorityFormats!, isSRGB) as KTX2TargetFormat;

    if (
      targetFormat === KTX2TargetFormat.PVRTC &&
      (!MathUtil.isPowerOf2(pixelWidth) || !MathUtil.isPowerOf2(pixelHeight) || pixelWidth !== pixelHeight)
    ) {
      Logger.warn("PVRTC image need power of 2 and width===height, downgrade to RGBA8");
      return KTX2TargetFormat.R8G8B8A8;
    }

    if (targetFormat === null) {
      Logger.warn("Can't support any compressed texture, downgrade to RGBA8");
      return KTX2TargetFormat.R8G8B8A8;
    }
    return targetFormat;
  }

  private static _detectSupportedFormat(
    renderer: any,
    priorityFormats: KTX2TargetFormat[],
    isSRGB: boolean
  ): KTX2TargetFormat | null {
    for (let i = 0; i < priorityFormats.length; i++) {
      const format = priorityFormats[i];
      const capabilities =
        this._capabilityMap[format]?.[isSRGB ? DFDTransferFunction.sRGB : DFDTransferFunction.linear];
      if (capabilities) {
        for (let j = 0; j < capabilities.length; j++) {
          if (renderer.canIUse(capabilities[j])) {
            return format;
          }
        }
      } else {
        switch (priorityFormats[i]) {
          case KTX2TargetFormat.R8G8B8A8:
            return format;
          case KTX2TargetFormat.R8:
          case KTX2TargetFormat.R8G8:
            if (renderer.isWebGL2) return format;
        }
      }
    }
    return null;
  }

  private static _getBinomialLLCTranscoder(workerCount: number = 4) {
    return (this._binomialLLCTranscoder ??= new BinomialLLCTranscoder(workerCount));
  }

  private static _getEngineTextureFormat(
    basisFormat: KTX2TargetFormat,
    transcodeResult: TranscodeResult
  ): TextureFormat | undefined {
    const { hasAlpha } = transcodeResult;
    switch (basisFormat) {
      case KTX2TargetFormat.ASTC:
        return TextureFormat.ASTC_4x4;
      case KTX2TargetFormat.ETC:
        return hasAlpha ? TextureFormat.ETC2_RGBA8 : TextureFormat.ETC2_RGB;
      case KTX2TargetFormat.BC7:
        return TextureFormat.BC7;
      case KTX2TargetFormat.BC1_BC3:
        return hasAlpha ? TextureFormat.BC3 : TextureFormat.BC1;
      case KTX2TargetFormat.PVRTC:
        return hasAlpha ? TextureFormat.PVRTC_RGBA4 : TextureFormat.PVRTC_RGB4;
      case KTX2TargetFormat.R8G8B8A8:
        return TextureFormat.R8G8B8A8;
      case KTX2TargetFormat.BC6H:
        return TextureFormat.BC6H;
      case KTX2TargetFormat.ASTC_HDR_4x4:
        return TextureFormat.ASTC_4x4;
      case KTX2TargetFormat.R16G16B16A16:
        return TextureFormat.R16G16B16A16;
    }
  }

  override initialize(_: Engine, configuration: EngineConfiguration): Promise<void> | void {
    if (configuration.ktx2Loader) {
      const options = configuration.ktx2Loader;
      if (options.priorityFormats) {
        KTX2Loader._priorityFormats["etc1s"] = options.priorityFormats;
        KTX2Loader._priorityFormats["uastc"] = options.priorityFormats;
      }

      return KTX2Loader._getBinomialLLCTranscoder(options.workerCount).init();
    }
  }

  /**
   * @internal
   */
  load(
    item: LoadItem & { params?: KTX2Params },
    resourceManager: ResourceManager
  ): AssetPromise<Texture2D | TextureCube> {
    const remoteUrl = resourceManager._getRemoteUrl(item.url!);
    return new AssetPromise((resolve, reject, setTaskCompleteProgress, setTaskDetailProgress) => {
      const requestConfig = <RequestConfig>{
        ...item,
        type: "arraybuffer"
      };
      resourceManager
        ._requestByRemoteUrl<ArrayBuffer>(remoteUrl, requestConfig)
        .onProgress(setTaskCompleteProgress, setTaskDetailProgress)
        .then((buffer) => KTX2Loader._loadTextureFromBuffer(buffer, resourceManager.engine, item.params))
        .then((texture) => {
          resourceManager.addContentRestorer(new KTX2ContentRestorer(texture, remoteUrl, requestConfig));
          resolve(texture);
        })
        .catch(reject);
    });
  }
}

class KTX2ContentRestorer extends ContentRestorer<Texture2D | TextureCube> {
  constructor(
    resource: Texture2D | TextureCube,
    public remoteUrl: string,
    public requestConfig: RequestConfig & { params?: KTX2Params }
  ) {
    super(resource);
  }

  override restoreContent(): AssetPromise<Texture2D | TextureCube> {
    const { resource, requestConfig } = this;
    const engine = resource.engine;
    return new AssetPromise((resolve, reject) => {
      engine.resourceManager
        ._requestByRemoteUrl<ArrayBuffer>(this.remoteUrl, requestConfig)
        .then((buffer) => KTX2Loader._loadTextureFromBuffer(buffer, engine, requestConfig.params, resource))
        .then(resolve)
        .catch(reject);
    });
  }
}

/**
 * KTX2 loader params interface.
 */
export interface KTX2Params {
  /** Priority transcoding format queue which is preferred options, default is BC7/ASTC/BC3_BC1/ETC/PVRTC/R8G8B8A8. */
  /** @deprecated */
  priorityFormats: KTX2TargetFormat[];
}

declare module "@galacean/engine-core" {
  interface EngineConfiguration {
    /** KTX2 loader options. If set this option and workCount is great than 0, workers will be created. */
    ktx2Loader?: {
      /** Worker count for transcoder, default is 4. */
      workerCount?: number;
      /** Global transcoding format queue which will be used if not specified in per-instance param, default is BC7/ASTC/BC3_BC1/ETC/PVRTC/R8G8B8A8. */
      /** @deprecated */
      priorityFormats?: KTX2TargetFormat[];
    };
  }
}
