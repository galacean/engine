/**
 * Clone interface.
 */
export interface IClone<T> {
  /**
   * Clone and return object.
   * @returns Clone object
   */
  clone(): T;
}
