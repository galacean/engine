import {
  AssetPromise,
  AssetType,
  Engine,
  EngineConfiguration,
  GLCapabilityType,
  LoadItem,
  Loader,
  Logger,
  ResourceManager,
  Texture2D,
  TextureCube,
  TextureCubeFace,
  TextureFormat,
  resourceLoader
} from "@galacean/engine-core";
import { MathUtil } from "@galacean/engine-math";
import { KTX2Container } from "./KTX2Container";
import { KTX2TargetFormat } from "./KTX2TargetFormat";
import { TranscodeResult } from "./transcoder/AbstractTranscoder";
import { BinomialLLCTranscoder } from "./transcoder/BinomialLLCTranscoder";
import { KhronosTranscoder } from "./transcoder/KhronosTranscoder";

@resourceLoader(AssetType.KTX2, ["ktx2"])
export class KTX2Loader extends Loader<Texture2D | TextureCube> {
  private static _isBinomialInit: boolean = false;
  private static _binomialLLCTranscoder: BinomialLLCTranscoder;
  private static _khronosTranscoder: KhronosTranscoder;
  private static _priorityFormats = {
    etc1s: [
      KTX2TargetFormat.ETC,
      KTX2TargetFormat.BC7,
      KTX2TargetFormat.ASTC,
      KTX2TargetFormat.BC1_BC3,
      KTX2TargetFormat.PVRTC
    ],
    uastc: [
      KTX2TargetFormat.ASTC,
      KTX2TargetFormat.BC7,
      KTX2TargetFormat.ETC,
      KTX2TargetFormat.BC1_BC3,
      KTX2TargetFormat.PVRTC
    ]
  };
  private static _supportedMap = {
    [KTX2TargetFormat.ASTC]: [GLCapabilityType.astc],
    [KTX2TargetFormat.ETC]: [GLCapabilityType.etc],
    [KTX2TargetFormat.BC7]: [GLCapabilityType.bptc],
    [KTX2TargetFormat.BC1_BC3]: [GLCapabilityType.s3tc],
    [KTX2TargetFormat.PVRTC]: [GLCapabilityType.pvrtc, GLCapabilityType.pvrtc_webkit]
  };

  /**
   * Destroy ktx2 transcoder worker.
   */
  static destroy(): void {
    if (this._binomialLLCTranscoder) this._binomialLLCTranscoder.destroy();
    if (this._khronosTranscoder) this._khronosTranscoder.destroy();
    this._binomialLLCTranscoder = null;
    this._khronosTranscoder = null;
    this._isBinomialInit = false;
  }

  /** @internal */
  static _parseBuffer(buffer: Uint8Array, engine: Engine, params?: KTX2Params) {
    const ktx2Container = new KTX2Container(buffer);
    const formatPriorities =
      params?.priorityFormats ?? KTX2Loader._priorityFormats[ktx2Container.isUASTC ? "uastc" : "etc1s"];
    const targetFormat = KTX2Loader._decideTargetFormat(engine, ktx2Container, formatPriorities);
    let transcodeResultPromise: Promise<TranscodeResult>;
    if (KTX2Loader._isBinomialInit || !KhronosTranscoder.transcoderMap[targetFormat] || !ktx2Container.isUASTC) {
      const binomialLLCWorker = KTX2Loader._getBinomialLLCTranscoder();
      transcodeResultPromise = binomialLLCWorker.init().then(() => binomialLLCWorker.transcode(buffer, targetFormat));
    } else {
      const khronosWorker = KTX2Loader._getKhronosTranscoder();
      transcodeResultPromise = khronosWorker.init().then(() => khronosWorker.transcode(ktx2Container));
    }
    return transcodeResultPromise.then((result) => {
      return { engine, result, targetFormat, params: ktx2Container.keyValue["GalaceanTextureParams"] as Uint8Array };
    });
  }

  /** @internal */
  static _createTextureByBuffer(
    engine: Engine,
    transcodeResult: TranscodeResult,
    targetFormat: KTX2TargetFormat,
    params?: Uint8Array
  ): Texture2D | TextureCube {
    const { width, height, faces } = transcodeResult;
    const faceCount = faces.length;
    const mipmaps = faces[0];
    const mipmap = mipmaps.length > 1;
    const engineFormat = this._getEngineTextureFormat(targetFormat, transcodeResult);
    let texture: Texture2D | TextureCube;
    if (faceCount !== 6) {
      texture = new Texture2D(engine, width, height, engineFormat, mipmap);
      for (let mipLevel = 0; mipLevel < mipmaps.length; mipLevel++) {
        const { data } = mipmaps[mipLevel];
        texture.setPixelBuffer(data, mipLevel);
      }
    } else {
      texture = new TextureCube(engine, height, engineFormat, mipmap);
      for (let i = 0; i < faces.length; i++) {
        const faceData = faces[i];
        for (let mipLevel = 0; mipLevel < mipmaps.length; mipLevel++) {
          texture.setPixelBuffer(TextureCubeFace.PositiveX + i, faceData[mipLevel].data, mipLevel);
        }
      }
    }
    if (params) {
      texture.wrapModeU = params[0];
      texture.wrapModeV = params[1];
      texture.filterMode = params[2];
      texture.anisoLevel = params[3];
    }
    return texture as Texture2D | TextureCube;
  }

  private static _decideTargetFormat(
    engine: Engine,
    ktx2Container: KTX2Container,
    priorityFormats?: KTX2TargetFormat[]
  ): KTX2TargetFormat {
    const renderer = (engine as any)._hardwareRenderer;

    const targetFormat = this._detectSupportedFormat(renderer, priorityFormats) as KTX2TargetFormat;

    if (
      targetFormat === KTX2TargetFormat.PVRTC &&
      (!MathUtil.isPowerOf2(ktx2Container.pixelWidth) ||
        !MathUtil.isPowerOf2(ktx2Container.pixelHeight) ||
        ktx2Container.pixelWidth !== ktx2Container.pixelHeight)
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

  private static _detectSupportedFormat(renderer: any, priorityFormats: KTX2TargetFormat[]): KTX2TargetFormat | null {
    for (let i = 0; i < priorityFormats.length; i++) {
      const format = priorityFormats[i];
      const capabilities = this._supportedMap[format];
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
    KTX2Loader._isBinomialInit = true;
    return (this._binomialLLCTranscoder ??= new BinomialLLCTranscoder(workerCount));
  }

  private static _getKhronosTranscoder(workerCount: number = 4) {
    return (this._khronosTranscoder ??= new KhronosTranscoder(workerCount, KTX2TargetFormat.ASTC));
  }

  private static _getEngineTextureFormat(
    basisFormat: KTX2TargetFormat,
    transcodeResult: TranscodeResult
  ): TextureFormat {
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
    }
  }

  override initialize(_: Engine, configuration: EngineConfiguration): Promise<void> {
    if (configuration.ktx2Loader) {
      const options = configuration.ktx2Loader;
      if (options.priorityFormats) {
        KTX2Loader._priorityFormats["etc1s"] = options.priorityFormats;
        KTX2Loader._priorityFormats["uastc"] = options.priorityFormats;
      }
      
      if (options.transcoder === KTX2Transcoder.Khronos) {
        return KTX2Loader._getKhronosTranscoder(options.workerCount).init();
      } else {
        return KTX2Loader._getBinomialLLCTranscoder(options.workerCount).init();
      }
    }
  }

  /**
   * @internal
   */
  load(
    item: LoadItem & { params?: KTX2Params },
    resourceManager: ResourceManager
  ): AssetPromise<Texture2D | TextureCube> {
    return this.request<ArrayBuffer>(item.url!, { type: "arraybuffer" }).then((buffer) =>
      KTX2Loader._parseBuffer(new Uint8Array(buffer), resourceManager.engine, item.params).then(
        ({ engine, result, targetFormat, params }) =>
          KTX2Loader._createTextureByBuffer(engine, result, targetFormat, params)
      )
    );
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

/** Used for initialize KTX2 transcoder. */
export enum KTX2Transcoder {
  /** BinomialLLC transcoder. */
  BinomialLLC,
  /** Khronos transcoder. */
  Khronos
}

declare module "@galacean/engine-core" {
  interface EngineConfiguration {
    /** KTX2 loader options. */
    ktx2Loader?: {
      /** Worker count for transcoder, default is 4. */
      workerCount?: number;
      /** Global transcoding format queue which will be used if not specified in per-instance param, default is BC7/ASTC/BC3_BC1/ETC/PVRTC/R8G8B8A8. */
      /** @deprecated */
      priorityFormats?: KTX2TargetFormat[];
      /** Used for initialize KTX2 transcoder. */
      transcoder?: KTX2Transcoder;
    };
  }
}
