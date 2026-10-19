/** CPU geometry written synchronously by a backend and consumed by the shared renderer.
 * Arrays and batches are reused. A backend must not retain the target or its arrays after the call.
 */
export interface ISpineGeometry<TTexture> {
  /** Interleaved x, y, z, r, g, b, a, u, v, followed by dark r, g, b when tintBlack is enabled. */
  readonly vertices: Float32Array;
  readonly indices: Uint16Array;
  readonly vertexStride: number;
  readonly zSpacing: number;
  readonly premultipliedAlpha: boolean;
  readonly tintBlack: boolean;
  vertexCount: number;
  indexCount: number;
  /** Ensure capacity before writing. Read vertices/indices again after this call. */
  ensureCapacity(vertexCount: number, indexCount: number): void;
  /** Ordered triangle batch. Blend modes: normal=0, additive=1, multiply=2, screen=3. */
  addBatch(start: number, count: number, texture: TTexture, blendMode: 0 | 1 | 2 | 3): void;
  expandBounds(x: number, y: number, z: number): void;
}
