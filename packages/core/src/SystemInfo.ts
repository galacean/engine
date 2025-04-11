import { GLCapabilityType } from "./base/Constant";
import { Engine } from "./Engine";
import { Platform } from "./Platform";
import { TextureFormat } from "./texture";

/**
 * Access operating system, platform and hardware information.
 */
export class SystemInfo {
  /** The platform is running on. */
  static platform: Platform = Platform.Unknown;
  /** The operating system is running on. */
  static operatingSystem: string = "";

  /** @internal */
  static _isBrowser = true;

  /** Whether the system support SIMD. */
  private static _simdSupported: boolean | null = null;

  /**
   * The pixel ratio of the device.
   */
  static get devicePixelRatio(): number {
    return window.devicePixelRatio;
  }

  /**
   * @internal
   */
  static _initialize(): void {
    {
      if (typeof navigator == "undefined") {
        SystemInfo._isBrowser = false;
        return;
      }

      const userAgent = navigator.userAgent;

      if (/iPhone/i.test(userAgent)) {
        SystemInfo.platform = Platform.IPhone;
      } else if (/iPad/i.test(userAgent)) {
        SystemInfo.platform = Platform.IPad;
      } else if (/Android/i.test(userAgent)) {
        SystemInfo.platform = Platform.Android;
      } else if (/Macintosh/i.test(userAgent)) {
        SystemInfo.platform = Platform.Mac;
      }

      let v: RegExpMatchArray;
      switch (SystemInfo.platform) {
        case Platform.IPhone:
          v = userAgent.match(/OS (\d+)_?(\d+)?_?(\d+)?/);
          this.operatingSystem = v ? `iPhone OS ${v[1]}.${v[2] || 0}.${v[3] || 0}` : "iPhone OS";
          break;
        case Platform.IPad:
          v = userAgent.match(/OS (\d+)_?(\d+)?_?(\d+)?/);
          this.operatingSystem = v ? `iPad OS ${v[1]}.${v[2] || 0}.${v[3] || 0}` : "iPad OS";
          break;
        case Platform.Android:
          v = userAgent.match(/Android (\d+).?(\d+)?.?(\d+)?/);
          this.operatingSystem = v ? `Android ${v[1]}.${v[2] || 0}.${v[3] || 0}` : "Android";
          break;
        case Platform.Mac:
          v = userAgent.match(/Mac OS X (\d+)_?(\d+)?_?(\d+)?/);
          this.operatingSystem = v ? `Mac OS X ${v[1]}.${v[2] || 0}.${v[3] || 0}` : "Mac OS X";
          break;
      }
    }
  }

  /**
   * @internal
   */
  static _detectSIMDSupported(): boolean {
    if (this._simdSupported === null) {
      this._simdSupported = WebAssembly.validate(
        new Uint8Array([
          0, 97, 115, 109, 1, 0, 0, 0, 1, 4, 1, 96, 0, 0, 3, 3, 2, 0, 0, 5, 3, 1, 0, 1, 12, 1, 0, 10, 22, 2, 12, 0, 65,
          0, 65, 0, 65, 0, 252, 10, 0, 0, 11, 7, 0, 65, 0, 253, 15, 26, 11
        ])
      );
    }
    return this._simdSupported;
  }

  /**
   * Checks whether the system supports the given texture format.
   * @param format - The texture format
   * @returns Whether support the texture format
   */
  static supportsTextureFormat(engine: Engine, format: TextureFormat): boolean {
    const rhi = engine._hardwareRenderer;
    rhi.canIUse(GLCapabilityType.depthTexture);
    switch (format) {
      case TextureFormat.R16G16B16A16:
        if (!rhi.canIUse(GLCapabilityType.textureHalfFloat)) {
          return false;
        }
        break;
      case TextureFormat.R32G32B32A32:
        if (!rhi.canIUse(GLCapabilityType.textureFloat)) {
          return false;
        }
        break;
      case TextureFormat.Depth16:
      case TextureFormat.Depth24Stencil8:
      case TextureFormat.Depth:
      case TextureFormat.DepthStencil:
        if (!rhi.canIUse(GLCapabilityType.depthTexture)) {
          return false;
        }
        break;
      case TextureFormat.R11G11B10_UFloat:
      case TextureFormat.R32G32B32A32_UInt:
      case TextureFormat.Depth24:
      case TextureFormat.Depth32:
      case TextureFormat.Depth32Stencil8:
      case TextureFormat.R8:
      case TextureFormat.R8G8:
        return rhi.isWebGL2;
    }

    return true;
  }
}

SystemInfo._initialize();
