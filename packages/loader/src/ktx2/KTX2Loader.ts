import {
  AssetPromise,
  AssetType,
  Engine,
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
import { BinomialLLCTranscoder } from "./BinomialLLCTranscoder/BinomialLLCTranscoder";
import { KTX2Container } from "./KTX2Container";
import { KhronosTranscoder } from "./KhronosTranscoder/KhronosTranscoder";
import { KTX2TargetFormat } from "./KTX2TargetFormat";
import { WebGLEngine } from "@galacean/engine-rhi-webgl";
import { MathUtil } from "@galacean/engine-math";
import { TranscodeResult } from "./TranscodeResult";

@resourceLoader(AssetType.KTX, ["ktx2"])
export class KTX2Loader extends Loader<Texture2D | TextureCube> {
  private static _binomialLLCTranscoder: BinomialLLCTranscoder;
  private static _khronosTranscoder: KhronosTranscoder;
  private static _supportedMap = {
    [KTX2TargetFormat.ASTC]: [GLCapabilityType.astc],
    [KTX2TargetFormat.ETC]: [GLCapabilityType.etc],
    [KTX2TargetFormat.DXT]: [GLCapabilityType.s3tc],
    [KTX2TargetFormat.PVRTC]: [GLCapabilityType.pvrtc, GLCapabilityType.pvrtc_webkit]
  };

  /**
   * Initialize ktx2 transcoder.
   * @param engine - WebGLEngine
   * @param workerCount - Worker count for transcoder, default is 4
   * @param formatPriorities - Transcoder Format priorities, default
   * @returns
   */
  static init(engine: WebGLEngine, workerCount: number = 4, formatPriorities?: KTX2TargetFormat[]): Promise<void> {
    // @ts-ignore
    if (this._decisionTargetFormat(engine._hardwareRenderer, formatPriorities) === KTX2TargetFormat.ASTC) {
      return this._getKhronosTranscoder(workerCount).init();
    } else {
      return this._getBinomialLLCTranscoder(workerCount).init();
    }
  }

  /**
   * Destroy ktx2 transcoder worker.
   */
  static destroy(): void {
    if (this._binomialLLCTranscoder) this._binomialLLCTranscoder.destroy();
    if (this._khronosTranscoder) this._khronosTranscoder.destroy();
    this._binomialLLCTranscoder = null;
    this._khronosTranscoder = null;
  }

  private static _detectTranscoder(
    engine: Engine,
    ktx2Container: KTX2Container,
    formatPriorities?: KTX2TargetFormat[]
  ): KTX2TargetFormat {
    // @ts-ignore
    const renderer = engine._hardwareRenderer as WebGLRenderer;

    const targetFormat = this._decisionTargetFormat(renderer, formatPriorities) as KTX2TargetFormat;

    if (
      targetFormat === KTX2TargetFormat.PVRTC &&
      (!MathUtil.isPowerOf2(ktx2Container.pixelWidth) || !MathUtil.isPowerOf2(ktx2Container.pixelHeight))
    ) {
      Logger.warn("pvrtc image need power of 2, downgrade to RGBA32");
      return KTX2TargetFormat.RGBA32;
    }

    if (targetFormat === null) {
      Logger.warn("can't support any compressed texture, downgrade to RGBA32");
      return KTX2TargetFormat.RGBA32;
    }
    // TODO support bc7: https://github.com/galacean/engine/issues/1371
    return targetFormat;
  }

  private static _decisionTargetFormat(
    renderer: any,
    formatPriorities: KTX2TargetFormat[] = [
      KTX2TargetFormat.ASTC,
      KTX2TargetFormat.ETC,
      KTX2TargetFormat.DXT,
      KTX2TargetFormat.PVRTC
    ]
  ): KTX2TargetFormat | null {
    for (let i = 0; i < formatPriorities.length; i++) {
      const capabilities = this._supportedMap[formatPriorities[i]];
      for (let j = 0; j < capabilities.length; j++) {
        if (renderer.canIUse(capabilities[j])) {
          return formatPriorities[i];
        }
      }
    }
    return null;
  }

  private static _getBinomialLLCTranscoder(workerCount: number = 4) {
    if (!this._binomialLLCTranscoder) {
      this._binomialLLCTranscoder = new BinomialLLCTranscoder(workerCount);
    }
    return this._binomialLLCTranscoder;
  }

  private static _getKhronosTranscoder(workerCount: number = 4) {
    if (!this._khronosTranscoder) {
      this._khronosTranscoder = new KhronosTranscoder(workerCount, KTX2TargetFormat.ASTC);
    }
    return this._khronosTranscoder;
  }

  /**
   * @internal
   */
  load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<any> {
    return this.request<ArrayBuffer>(item.url!, { type: "arraybuffer" }).then((buffer) => {
      const ktx2Container = new KTX2Container(buffer);
      const formatPriorities = item.params?.formatPriorities;
      const targetFormat = KTX2Loader._detectTranscoder(resourceManager.engine, ktx2Container, formatPriorities);
      let transcodeResultPromise: Promise<any>;
      if (targetFormat === KTX2TargetFormat.ASTC && ktx2Container.isUASTC) {
        const khronosWorker = KTX2Loader._getKhronosTranscoder();
        transcodeResultPromise = khronosWorker.init().then(() => khronosWorker.transcode(ktx2Container));
      } else {
        const binomialLLCWorker = KTX2Loader._getBinomialLLCTranscoder();
        transcodeResultPromise = binomialLLCWorker.init().then(() => binomialLLCWorker.transcode(buffer, targetFormat));
      }
      return transcodeResultPromise.then((result) => {
        const { width, height, faces } = result;
        const faceCount = faces.length;
        const mipmaps = faces[0];
        const mipmap = mipmaps.length > 1;
        const engineFormat = this._getEngineTextureFormat(targetFormat, result);
        if (faceCount !== 6) {
          const texture = new Texture2D(resourceManager.engine, width, height, engineFormat, mipmap);
          for (let mipLevel = 0; mipLevel < mipmaps.length; mipLevel++) {
            const { width, height, data } = mipmaps[mipLevel];
            texture.setPixelBuffer(data, mipLevel, 0, 0, width, height);
          }
          const params = ktx2Container.keyValue["GalaceanTextureParams"] as Uint8Array;
          if (params) {
            texture.wrapModeU = params[0];
            texture.wrapModeV = params[1];
            texture.filterMode = params[2];
            texture.anisoLevel = params[3];
          }
          return texture;
        } else {
          const textureCube = new TextureCube(resourceManager.engine, height, engineFormat, mipmap);
          for (let i = 0; i < faces.length; i++) {
            const faceData = faces[i];
            for (let mipLevel = 0; mipLevel < mipmaps.length; mipLevel++) {
              textureCube.setPixelBuffer(TextureCubeFace.PositiveX + i, faceData[mipLevel].data, mipLevel);
            }
          }
          return textureCube;
        }
      });
    });
  }

  private _getEngineTextureFormat(basisFormat: KTX2TargetFormat, transcodeResult: TranscodeResult) {
    const { hasAlpha, width, height } = transcodeResult;
    if (basisFormat === KTX2TargetFormat.ASTC) {
      return TextureFormat.ASTC_4x4;
    }
    if (basisFormat === KTX2TargetFormat.ETC) {
      if (hasAlpha) return TextureFormat.ETC2_RGBA8;
      else return TextureFormat.ETC2_RGB;
    }
    if (basisFormat === KTX2TargetFormat.DXT) {
      if (hasAlpha) return TextureFormat.DXT5;
      else return TextureFormat.DXT1;
    }
    if (basisFormat === KTX2TargetFormat.PVRTC && MathUtil.isPowerOf2(width) && MathUtil.isPowerOf2(height)) {
      if (hasAlpha) return TextureFormat.PVRTC_RGBA4;
      else return TextureFormat.PVRTC_RGB4;
    }
    if (basisFormat === KTX2TargetFormat.RGBA32) {
      return TextureFormat.R8G8B8A8;
    }
  }
}
