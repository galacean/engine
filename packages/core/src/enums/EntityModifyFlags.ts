/**
 * The entity modify flags.
 */
export enum EntityModifyFlags {
  /** The parent changes. */
  Parent = 0x1,
  /** Add child. */
  AddChild = 0x2,
  /** Remove child. */
  RemoveChild = 0x4,
  /** The sibling index changes. */
  SiblingIndex = 0x8
}
