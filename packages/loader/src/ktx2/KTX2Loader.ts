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
import { ColorModel, DFDTransferFunction, KTX2Container } from "./KTX2Container";
import { KTX2TargetFormat } from "./KTX2TargetFormat";
import { readNativeKTX2 } from "./readNativeKTX2";
import { TranscodeResult } from "./transcoder/AbstractTranscoder";
import { BinomialLLCTranscoder } from "./transcoder/BinomialLLCTranscoder";

interface KTX2Image {
  width: number;
  height: number;
  format: TextureFormat;
  faces: { data: ArrayBufferView }[][];
}

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
  static async _parseBuffer(buffer: Uint8Array, engine: Engine, params?: KTX2Params) {
    const container = new KTX2Container(buffer);
    const image = readNativeKTX2(container) ?? (await this._transcodeBasis(buffer, container, engine, params));
    return { ...image, isSRGB: container.isSRGB, params: container.keyValue["GalaceanTextureParams"] as Uint8Array };
  }

  private static async _transcodeBasis(
    buffer: Uint8Array,
    container: KTX2Container,
    engine: Engine,
    params?: KTX2Params
  ): Promise<KTX2Image> {
    const defaultFormats = this._priorityFormats[container.colorModel];
    if (!defaultFormats) {
      throw new Error(`Unsupported KTX2 format (vkFormat=${container.vkFormat}, DFD model=${container.colorModel})`);
    }
    const target = this._decideTargetFormat(engine, container, params?.priorityFormats ?? defaultFormats);
    const transcoder = this._getBinomialLLCTranscoder();
    await transcoder.init();
    const result = await transcoder.transcode(buffer, target);
    const { width, height, faces } = result;
    const format = this._getEngineTextureFormat(target, result) ?? TextureFormat.R8G8B8A8;
    return { width, height, faces, format };
  }

  /** @internal */
  static _createTextureByBuffer(
    engine: Engine,
    { width, height, faces, format, isSRGB, params }: KTX2Image & { isSRGB: boolean; params?: Uint8Array },
    texture?: Texture2D | TextureCube
  ): Texture2D | TextureCube {
    const cube = faces.length === 6;
    const mipmap = faces[0].length > 1;
    if (
      texture &&
      (texture instanceof TextureCube !== cube ||
        texture.width !== width ||
        texture.height !== height ||
        texture.format !== format ||
        texture.mipmapCount > 1 !== mipmap)
    ) {
      throw new Error("KTX2 image does not match the texture being restored");
    }
    texture ??= cube
      ? new TextureCube(engine, height, format, mipmap, isSRGB)
      : new Texture2D(engine, width, height, format, mipmap, isSRGB);
    for (let face = 0; face < faces.length; face++) {
      const levels = faces[face];
      for (let level = 0; level < levels.length; level++) {
        const { data } = levels[level];
        if (texture instanceof TextureCube) {
          texture.setPixelBuffer(TextureCubeFace.PositiveX + face, data, level);
        } else {
          texture.setPixelBuffer(data, level);
        }
      }
    }
    if (params) {
      texture.wrapModeU = params[0];
      texture.wrapModeV = params[1];
      texture.filterMode = params[2];
      texture.anisoLevel = params[3];
    }
    return texture;
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
        .then((buffer) => KTX2Loader._parseBuffer(new Uint8Array(buffer), resourceManager.engine, item.params))
        .then((parsed) => {
          const texture = KTX2Loader._createTextureByBuffer(resourceManager.engine, parsed);
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
        .then((buffer) => KTX2Loader._parseBuffer(new Uint8Array(buffer), engine, requestConfig.params))
        .then((parsed) => resolve(KTX2Loader._createTextureByBuffer(engine, parsed, resource)))
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
