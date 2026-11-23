/**
 * @internal
 * Constant buffer binding point allocation.
 */
export enum ConstantBufferBindingPoint {
  RendererInstance = 0,
  Scene = 1,
  Camera = 2,
  /** Subsequent slots belong to additional automatic blocks in the same variant. */
  Auto = 3
}
