/**
 * Force upload shader data flag.
 */
export enum ForceUploadShaderDataFlag {
  /** Upload nothing. */
  None = 0,
  /** Upload scene shader data. */
  Scene = 0x1,
  /** Upload camera shader data. */
  Camera = 0x2,
  /** Upload renderer shader data. */
  Renderer = 0x4,
  /** Upload material shader data. */
  Material = 0x8
}
