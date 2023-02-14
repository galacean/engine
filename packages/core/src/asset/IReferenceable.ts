export interface IReferenceable {
  /**
   * @internal
   */
  _getRefCount(): number;
  /**
   * @internal
   */
  _addRefCount(count: number): void;
}
