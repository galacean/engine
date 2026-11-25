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
  Texture2DArray,
  TextureCube,
  TextureCubeFace,
  TextureFormat,
  resourceLoader
} from "@galacean/engine-core";
import { MathUtil } from "@galacean/engine-math";
import { ColorModel, DFDTransferFunction, KTX2Container } from "./KTX2Container";
import { KTX2TargetFormat } from "./KTX2TargetFormat";
import { TranscodeResult } from "./transcoder/AbstractTranscoder";
import { BinomialLLCTranscoder } from "./transcoder/BinomialLLCTranscoder";

type KTX2Texture = Texture2D | Texture2DArray | TextureCube;

@resourceLoader(AssetType.KTX2, ["ktx2"])
export class KTX2Loader extends Loader<KTX2Texture> {
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
    [ColorModel.UASTC_HDR_4X4]: [
      KTX2TargetFormat.ASTC_HDR_4x4,
      KTX2TargetFormat.BC6H,
      KTX2TargetFormat.R16G16B16A16_SFloat
    ]
  };
  private static _capabilityMap = {
    [KTX2TargetFormat.ASTC]: {
      [DFDTransferFunction.linear]: GLCapabilityType.astc,
      [DFDTransferFunction.sRGB]: GLCapabilityType.astc
    },
    [KTX2TargetFormat.ETC]: {
      [DFDTransferFunction.linear]: GLCapabilityType.etc,
      [DFDTransferFunction.sRGB]: GLCapabilityType.etc
    },
    [KTX2TargetFormat.BC7]: {
      [DFDTransferFunction.linear]: GLCapabilityType.bptc,
      [DFDTransferFunction.sRGB]: GLCapabilityType.bptc
    },
    [KTX2TargetFormat.BC1_BC3]: {
      [DFDTransferFunction.linear]: GLCapabilityType.s3tc,
      [DFDTransferFunction.sRGB]: GLCapabilityType.s3tc_srgb
    },
    [KTX2TargetFormat.BC6H]: {
      [DFDTransferFunction.linear]: GLCapabilityType.bptc
    },
    [KTX2TargetFormat.ASTC_HDR_4x4]: {
      [DFDTransferFunction.linear]: GLCapabilityType.astc_hdr
    },
    [KTX2TargetFormat.PVRTC]: { [DFDTransferFunction.linear]: GLCapabilityType.pvrtc }
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
  static _parseBuffer(buffer: Uint8Array, engine: Engine, params?: KTX2Params) {
    const ktx2Container = new KTX2Container(buffer);
    const formatPriorities = params?.priorityFormats ?? KTX2Loader._priorityFormats[ktx2Container.colorModel];
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

  /**
   * @internal
   * @param layerCount - KTX2 `layerCount`. A value above 0 declares an array texture, also for one layer.
   */
  static _createTextureByBuffer(
    engine: Engine,
    isSRGB: boolean,
    transcodeResult: TranscodeResult,
    targetFormat: KTX2TargetFormat,
    params?: Uint8Array,
    restoredTexture?: KTX2Texture,
    layerCount: number = 0
  ): KTX2Texture {
    const { width, height, faces } = transcodeResult;
    const faceCount = faces.length;
    const mipmaps = faces[0];
    const mipmap = mipmaps.length > 1;
    const engineFormat = this._getEngineTextureFormat(targetFormat, transcodeResult);
    let texture: KTX2Texture;
    if (layerCount > 0) {
      if (faceCount !== 1) throw new Error("KTX2 cube array textures are not supported");
      texture = restoredTexture || new Texture2DArray(engine, width, height, layerCount, engineFormat, mipmap, isSRGB);
      // The transcoder returns each level as its layers in order, which is the array upload layout.
      for (let mipLevel = 0; mipLevel < mipmaps.length; mipLevel++) {
        (<Texture2DArray>texture).setPixelBuffer(0, mipmaps[mipLevel].data, mipLevel);
      }
    } else if (faceCount !== 6) {
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
    if (params) {
      texture.wrapModeU = params[0];
      texture.wrapModeV = params[1];
      texture.filterMode = params[2];
      texture.anisoLevel = params[3];
    }
    return texture;
  }

  private static _astc2DArraySupport = new WeakMap<object, boolean>();

  private static _supportsCompressedTexture2DArrayASTC(renderer: any): boolean {
    if (!renderer || typeof renderer !== "object") return true;
    const cached = this._astc2DArraySupport.get(renderer);
    if (cached !== undefined) return cached;
    const gl = renderer.gl as WebGL2RenderingContext | undefined;
    if (!gl || typeof gl.texStorage3D !== "function" || typeof gl.compressedTexSubImage3D !== "function") {
      this._astc2DArraySupport.set(renderer, false);
      return false;
    }
    // Some Android Chromium WebGL2 decoders (e.g. non-ANGLE validating decoder on Adreno) advertise
    // WEBGL_compressed_texture_astc and accept texStorage3D, yet reject compressedTexSubImage3D
    // with GL_INVALID_VALUE ("size is not correct for dimensions"). Probe a 4x4x1 block once.
    let supported = false;
    const prevTex = gl.getParameter(gl.TEXTURE_BINDING_2D_ARRAY);
    const tex = gl.createTexture();
    if (tex) {
      try {
        while (gl.getError() !== gl.NO_ERROR) {}
        gl.bindTexture(gl.TEXTURE_2D_ARRAY, tex);
        const ASTC_4X4_RGBA = 0x93b0;
        // Probe with depth=2 because the bug only manifests for multi-layer uploads (depth > 1).
        gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, ASTC_4X4_RGBA, 4, 4, 2);
        gl.compressedTexSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, 0, 4, 4, 2, ASTC_4X4_RGBA, new Uint8Array(32));
        supported = gl.getError() === gl.NO_ERROR;
      } catch {
        supported = false;
      } finally {
        gl.bindTexture(gl.TEXTURE_2D_ARRAY, prevTex);
        gl.deleteTexture(tex);
      }
    }
    this._astc2DArraySupport.set(renderer, supported);
    return supported;
  }

  private static _decideTargetFormat(
    engine: Engine,
    ktx2Container: KTX2Container,
    priorityFormats?: KTX2TargetFormat[]
  ): KTX2TargetFormat {
    const renderer = (engine as any)._hardwareRenderer;
    const { isSRGB, pixelWidth, pixelHeight, layerCount } = ktx2Container;
    let formats = priorityFormats!;
    if (layerCount > 0 && !this._supportsCompressedTexture2DArrayASTC(renderer)) {
      formats = formats.filter((f) => f !== KTX2TargetFormat.ASTC && f !== KTX2TargetFormat.ASTC_HDR_4x4);
    }
    const targetFormat = this._detectSupportedFormat(renderer, formats, isSRGB) as KTX2TargetFormat;

    if (
      targetFormat === KTX2TargetFormat.PVRTC &&
      (!MathUtil.isPowerOf2(pixelWidth) || !MathUtil.isPowerOf2(pixelHeight) || pixelWidth !== pixelHeight)
    ) {
      Logger.warn("PVRTC image need power of 2 and width===height, downgrade to RGBA8");
      return KTX2TargetFormat.R8G8B8A8_UNorm;
    }

    if (targetFormat === null) {
      Logger.warn("Can't support any compressed texture, downgrade to RGBA8");
      return KTX2TargetFormat.R8G8B8A8_UNorm;
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
      const capability = this._capabilityMap[format]?.[isSRGB ? DFDTransferFunction.sRGB : DFDTransferFunction.linear];
      if (capability) {
        if (renderer.canIUse(capability)) return format;
      } else {
        switch (priorityFormats[i]) {
          case KTX2TargetFormat.R8G8B8A8_UNorm:
            return format;
          case KTX2TargetFormat.R8_UNorm:
          case KTX2TargetFormat.R8G8_UNorm:
            return format;
          case KTX2TargetFormat.R16G16B16A16_SFloat:
            if (!isSRGB) return format;
        }
      }
    }
    return null;
  }

  /** @internal */
  static _defaultWorkerCount(): number {
    if (typeof navigator !== "undefined") {
      const cores = navigator.hardwareConcurrency;
      const ua = navigator.userAgent ?? "";
      const isMobile =
        /iPhone|iPad|iPod|Android|Mobile/i.test(ua) ||
        (/Macintosh/i.test(ua) && ((navigator as { maxTouchPoints?: number }).maxTouchPoints ?? 0) > 1);
      if (isMobile || (Number.isFinite(cores) && cores <= 4)) {
        return 2;
      }
    }
    return 4;
  }

  private static _getBinomialLLCTranscoder(workerCount: number = KTX2Loader._defaultWorkerCount()) {
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
      case KTX2TargetFormat.R8G8B8A8_UNorm:
        return TextureFormat.R8G8B8A8_UNorm;
      case KTX2TargetFormat.BC6H:
        return TextureFormat.BC6H;
      case KTX2TargetFormat.ASTC_HDR_4x4:
        return TextureFormat.ASTC_4x4;
      case KTX2TargetFormat.R16G16B16A16_SFloat:
        return TextureFormat.R16G16B16A16_SFloat;
    }
  }

  override initialize(_: Engine, configuration: EngineConfiguration): Promise<void> | void {
    if (configuration.ktx2Loader) {
      return KTX2Loader._getBinomialLLCTranscoder(configuration.ktx2Loader.workerCount).init();
    }
  }

  /**
   * @internal
   */
  load(item: LoadItem & { params?: KTX2Params }, resourceManager: ResourceManager): AssetPromise<KTX2Texture> {
    const remoteUrl = resourceManager._getRemoteUrl(item.url!);
    return new AssetPromise((resolve, reject, setTaskCompleteProgress, setTaskDetailProgress) => {
      const requestConfig = <RequestConfig>{
        ...item,
        type: "arraybuffer"
      };
      resourceManager
        ._requestByRemoteUrl<ArrayBuffer>(remoteUrl, requestConfig)
        .onProgress(setTaskCompleteProgress, setTaskDetailProgress)
        .then((buffer) =>
          KTX2Loader._parseBuffer(new Uint8Array(buffer), resourceManager.engine, item.params)
            .then(({ ktx2Container, engine, result, targetFormat, params }) =>
              KTX2Loader._createTextureByBuffer(
                engine,
                ktx2Container.isSRGB,
                result,
                targetFormat,
                params,
                undefined,
                ktx2Container.layerCount
              )
            )
            .then((texture) => {
              resourceManager.addContentRestorer(new KTX2ContentRestorer(texture, remoteUrl, requestConfig));
              resolve(texture);
            })
        )
        .catch(reject);
    });
  }
}

class KTX2ContentRestorer extends ContentRestorer<KTX2Texture> {
  constructor(
    resource: KTX2Texture,
    public remoteUrl: string,
    public requestConfig: RequestConfig & { params?: KTX2Params }
  ) {
    super(resource);
  }

  override restoreContent(): AssetPromise<KTX2Texture> {
    const { resource, requestConfig } = this;
    const engine = resource.engine;
    return new AssetPromise((resolve, reject) => {
      engine.resourceManager
        ._requestByRemoteUrl<ArrayBuffer>(this.remoteUrl, requestConfig)
        .then((buffer) =>
          KTX2Loader._parseBuffer(new Uint8Array(buffer), engine, requestConfig.params).then(
            ({ ktx2Container, engine, result, targetFormat, params }) =>
              KTX2Loader._createTextureByBuffer(
                engine,
                ktx2Container.isSRGB,
                result,
                targetFormat,
                params,
                resource,
                ktx2Container.layerCount
              )
          )
        )
        .then(resolve)
        .catch(reject);
    });
  }
}

/**
 * KTX2 loader params interface.
 */
export interface KTX2Params {
  /** Priority transcoding format queue which is preferred options, default is BC7/ASTC/BC3_BC1/ETC/PVRTC/R8G8B8A8_UNorm. */
  /** @deprecated */
  priorityFormats: KTX2TargetFormat[];
}

declare module "@galacean/engine-core" {
  interface EngineConfiguration {
    /** KTX2 loader options. If set this option and workCount is great than 0, workers will be created. */
    ktx2Loader?: {
      /** Worker count for transcoder, default is 4. */
      workerCount?: number;
    };
  }
}
