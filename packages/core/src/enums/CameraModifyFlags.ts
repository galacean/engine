/**
 * The camera modify flags.
 */
export enum CameraModifyFlags {
  /** The types of camera projections changes. */
  ProjectionType = 0x1,
  /** The aspect ratio of the camera changes. */
  AspectRatio = 0x2,
  /** The field of view of the camera changes. */
  FieldOfView = 0x4,
  /** The orthographic size of the camera changes. */
  OrthographicSize = 0x8,
  /** The camera becomes active in the scene. */
  EnableInScene = 0x10,
  /** The camera becomes inactive in the scene. */
  DisableInScene = 0x20
}
