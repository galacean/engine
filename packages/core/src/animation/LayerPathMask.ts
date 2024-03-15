/**
 * LayerPathMask represents a mask for a specific entity in an animation layer.
 * It is used to control the animation whether to be applied to the entity or not.
 */
export class LayerPathMask {
  /**
   * It identifies a particular entity in the hierarchy.
   * Example: "arm/left/hand" could be a path to the left hand of a character.
   */
  path: string;

  /**
   * The active property is indicating whether the animation at this path is active or not.
   * When true, the animation for this path is applied; when false, the animation for this path is ignored.
   */
  active: boolean;
}
