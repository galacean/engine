/**
 * Alpha blend mode.
 * @remarks
 * Only take effect when GPU blend is open.
 */
export enum BlendMode {
  /** SRC ALPHA * SRC + (1 - SRC ALPHA) * DEST */
  Normal,
  /** SRC ALPHA * SRC + ONE * DEST */
  Additive
}
