/**
 * Copy interface.
 */
export interface ICopy<S, T> {
  /**
   * Copy from source object.
   * @returns This object
   */
  copyFrom(source: S): T;

  /**
   * Copy to target object.
   * @returns This target object
   */
  copyTo?(target: S): S;
}
