/**
 * Culling mode.
 * @remarks specifies whether or not front- and/or back-facing polygons can be culled.
 */
export enum CullMode {
  /** Disable culling. */
  Off,
  /** cut the front-face of the polygons. */
  Front,
  /** cut the back-face of the polygons. */
  Back
}
