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
  static _initialize(): void {
    {
      if (typeof navigator == "undefined") {
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
}

SystemInfo._initialize();
