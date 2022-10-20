/**
 * System info.
 */
export class SystemInfo {
  /**
   * The pixel ratio of the device.
   */
  static get devicePixelRatio(): number {
    return window.devicePixelRatio;
  }

  /**
   * @internal
   */
  static _isIos(): boolean {
    if (!window) {
      return false;
    }

    const ua = window.navigator.userAgent.toLocaleLowerCase();
    return /iphone|ipad|ipod/.test(ua);
  }

  /**
   * @internal
   */
  static _isAppleDevice(): boolean {
    if (!window) {
      return false;
    }

    const ua = window.navigator.userAgent.toLocaleLowerCase();
    return /iphone|ipad|ipod|macintosh/.test(ua);
  }

  /**
   * @internal
   */
  static _isChrome(): boolean {
    if (!window) {
      return false;
    }

    const ua = window.navigator.userAgent.toLocaleLowerCase();
    return /Chrome/.test(ua);
  }
}
