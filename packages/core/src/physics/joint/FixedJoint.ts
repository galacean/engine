import { IDynamicCollider, IJoint } from "@galacean/engine-design";
import { Engine } from "../../Engine";
import { Joint } from "./Joint";

/*
 * Locks the relative position and rotation of the connected bodies.
 */
export class FixedJoint extends Joint {
  protected override _createJoint(actor: IDynamicCollider): IJoint {
    return Engine._nativePhysics.createFixedJoint(actor);
  }
}
