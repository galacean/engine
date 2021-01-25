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
}
