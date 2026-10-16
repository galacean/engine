import { ConstraintData } from "./ConstraintData";
import { BoneData } from "./BoneData";

/** Stores the setup pose for an {@link IkConstraint}.
 * <p>
 * See [IK constraints](http://esotericsoftware.com/spine-ik-constraints) in the Spine User Guide. */
export class IkConstraintData extends ConstraintData {
  /** The bones that are constrained by this IK constraint. */
  bones = new Array<BoneData>();

  /** The bone that is the IK target. */
  target: BoneData;

  /** Controls the bend direction of the IK bones, either 1 or -1. */
  bendDirection = 1;

  /** When true and only a single bone is being constrained, if the target is too close, the bone is scaled to reach it. */
  compress = false;

  /** When true, if the target is out of range, the parent bone is scaled to reach it. If more than one bone is being constrained
   * and the parent bone has local nonuniform scale, stretch is not applied. */
  stretch = false;

  /** When true, only a single bone is being constrained, and {@link #getCompress()} or {@link #getStretch()} is used, the bone
   * is scaled on both the X and Y axes. */
  uniform = false;

  /** A percentage (0-1) that controls the mix between the constrained and unconstrained rotations. */
  mix = 1;

  /** For two bone IK, the distance from the maximum reach of the bones that rotation will slow. */
  softness = 0;

  constructor(name: string) {
    super(name, 0, false);
  }
}
