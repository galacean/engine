export interface IReferable {
  /**
   * @internal
   */
  _getRefCount(): number;
  /**
   * @internal
   */
  _addRefCount(count: number): void;
}
