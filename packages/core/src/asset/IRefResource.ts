export interface IRefResource {
  /**
   * @internal
   */
  _getRefCount(): number;
  /**
   * @internal
   */
  _addRefCount(count: number): void;
}
