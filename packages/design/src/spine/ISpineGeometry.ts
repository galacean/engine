/** Receives CPU geometry synchronously from a backend, in skeleton draw order.
 * The shared renderer owns the output buffers and batches. Backends may reuse their input arrays after append returns.
 */
export interface ISpineGeometry<TTexture> {
  readonly premultipliedAlpha: boolean;
  readonly tintBlack: boolean;

  /** Append one drawable attachment after world vertex calculation and clipping.
   * Input vertices contain x, y, r, g, b, a, u, v, followed by dark r, g, b, a when tintBlack is enabled.
   * Only vertexCount vertices and indexCount indices are consumed; indices are local to this attachment.
   * drawOrder is the slot's index in the skeleton draw order, including slots without geometry.
   * Blend modes: normal=0, additive=1, multiply=2, screen=3.
   * The input arrays are copied during this call and are not retained.
   */
  append(
    vertices: ArrayLike<number>,
    vertexCount: number,
    indices: ArrayLike<number>,
    indexCount: number,
    texture: TTexture,
    blendMode: 0 | 1 | 2 | 3,
    drawOrder: number
  ): void;
}
