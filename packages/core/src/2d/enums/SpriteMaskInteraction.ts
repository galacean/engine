/**
 * Sprite mask interaction.
 */
export enum SpriteMaskInteraction {
  /** The sprite will not interact with the masking system. */
  None,
  /** The sprite will be visible only in areas where a mask is present. */
  VisibleInsideMask,
  /** The sprite will be visible only in areas where no mask is present. */
  VisibleOutsideMask
}
