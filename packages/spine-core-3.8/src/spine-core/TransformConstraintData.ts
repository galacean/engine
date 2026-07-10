import { ConstraintData } from "./ConstraintData";
import { BoneData } from "./BoneData";

/** Stores the setup pose for a {@link TransformConstraint}.
 *
 * See [Transform constraints](http://esotericsoftware.com/spine-transform-constraints) in the Spine User Guide. */
export class TransformConstraintData extends ConstraintData {
  /** The bones that will be modified by this transform constraint. */
  bones = new Array<BoneData>();

  /** The target bone whose world transform will be copied to the constrained bones. */
  target: BoneData;

  /** A percentage (0-1) that controls the mix between the constrained and unconstrained rotations. */
  rotateMix = 0;

  /** A percentage (0-1) that controls the mix between the constrained and unconstrained translations. */
  translateMix = 0;

  /** A percentage (0-1) that controls the mix between the constrained and unconstrained scales. */
  scaleMix = 0;

  /** A percentage (0-1) that controls the mix between the constrained and unconstrained shears. */
  shearMix = 0;

  /** An offset added to the constrained bone rotation. */
  offsetRotation = 0;

  /** An offset added to the constrained bone X translation. */
  offsetX = 0;

  /** An offset added to the constrained bone Y translation. */
  offsetY = 0;

  /** An offset added to the constrained bone scaleX. */
  offsetScaleX = 0;

  /** An offset added to the constrained bone scaleY. */
  offsetScaleY = 0;

  /** An offset added to the constrained bone shearY. */
  offsetShearY = 0;

  relative = false;
  local = false;

  constructor(name: string) {
    super(name, 0, false);
  }
}
