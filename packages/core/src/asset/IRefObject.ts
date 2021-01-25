export interface IRefObject {
  /**
   * @internal
   */
  _getRefCount(): number;
  /**
   * @internal
   */
  _addRefCount(count: number): void;
}
