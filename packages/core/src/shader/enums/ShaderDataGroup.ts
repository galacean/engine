/**
 * Shader data grouping.
 * @remarks enumeration can be combined using bit operations.
 */
export enum ShaderDataGroup {
  /** None group. */
  None = 0,
  /** Scene group. */
  Scene = 0x1,
  /** Camera group. */
  Camera = 0x2,
  /** Renderer group. */
  Renderer = 0x4,
  /** Material group. */
  Material = 0x8,
  /** Render element group. */
  RenderElement = 0x10
}
