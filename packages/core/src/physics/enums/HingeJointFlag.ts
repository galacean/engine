/**
 * Flags specific to the Hinge Joint.
 * @internal
 */
export enum HingeJointFlag {
  /** None. */
  None = 0,
  /** Enable the limit. */
  LimitEnabled = 1,
  /** Enable the drive. */
  DriveEnabled = 2,
  /** If the existing velocity is beyond the drive velocity, do not add force. */
  DriveFreeSpin = 4
}
