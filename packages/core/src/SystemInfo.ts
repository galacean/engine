import { Platform } from "./Platform";

/**
 * System info.
 */
export class SystemInfo {
  /** The platform is running on. */
  static platform: Platform = Platform.Unknown;
  /** The operating system is running on. */
  static operatingSystem: string = "";

  /**
   * The pixel ratio of the device.
   */
  static get devicePixelRatio(): number {
    return window.devicePixelRatio;
  }

  /**
   * @internal
   */
  static _initialization(): void {
    {
      if (typeof navigator == "undefined") {
        return;
      }

      const userAgent = navigator.userAgent;

      if (/iphone)/i.test(userAgent)) {
        SystemInfo.platform = Platform.IPhone;
      } else if (/ipad/i.test(userAgent)) {
        SystemInfo.platform = Platform.IPad;
      } else if (/android/i.test(userAgent)) {
        SystemInfo.platform = Platform.Android;
      }

      let v: RegExpMatchArray;
      switch (SystemInfo.platform) {
        case Platform.IPhone:
          v = userAgent.match(/OS (\d+)_(\d+)_?(\d+)?/);
          this.operatingSystem = `iPhone OS ${v[1]}.${v[2]}.${v[3]}`;
          break;
        case Platform.IPad:
          v = userAgent.match(/OS (\d+)_(\d+)_?(\d+)?/);
          this.operatingSystem = `iPad OS ${v[1]}.${v[2]}.${v[3]}`;
          break;
        case Platform.Android:
          v = userAgent.match(/Android (\d+).(\d+).?(\d+)?/);
          this.operatingSystem = `Android ${v[1]}.${v[2]}.${v[3]}`;
          break;
      }
    }
  }
}

SystemInfo._initialization();
