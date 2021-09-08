/**
 * Clone interface.
 */
export interface IClone {
  /**
   * Clone and return object.
   * @returns Clone object
   */
  clone(): Object;

  /**
   * Clone to the target object.
   * @param target - Target object
   */
  cloneTo(target: Object): void;
}
