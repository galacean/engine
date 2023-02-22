export interface IReferable {
  /**
   * @internal
   */
  _getReferCount(): number;
  /**
   * @internal
   */
  _addReferCount(count: number): void;
}
