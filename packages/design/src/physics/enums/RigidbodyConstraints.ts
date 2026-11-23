/**
 * Use these flags to constrain motion of a Rigidbody.
 */
export enum RigidbodyConstraints {
  /** Not Freeze. */
  None = 0,
  /** Freeze motion along the world X-axis. */
  FreezePositionX = 1,
  /** Freeze motion along the world Y-axis. */
  FreezePositionY = 2,
  /** Freeze motion along the world Z-axis. */
  FreezePositionZ = 4,
  /** Freeze rotation about the world X-axis. */
  FreezeRotationX = 8,
  /** Freeze rotation about the world Y-axis. */
  FreezeRotationY = 16,
  /** Freeze rotation about the world Z-axis. */
  FreezeRotationZ = 32,
  /** Freeze translation along all axes. */
  FreezePosition = FreezePositionX | FreezePositionY | FreezePositionZ,
  /** Freeze rotation about all axes. */
  FreezeRotation = FreezeRotationX | FreezeRotationY | FreezeRotationZ,
  /** Freeze all translation and rotation. */
  FreezeAll = FreezePosition | FreezeRotation
}
