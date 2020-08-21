/**
 * 系统信息。
 */
export class SystemInfo {
  /**
   * 设备的像素比。
   */
  static get devicePixelRatio(): number {
    return window.devicePixelRatio;
  }
}
