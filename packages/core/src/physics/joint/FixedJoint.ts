import { IDynamicCollider, IJoint } from "@galacean/engine-design";
import { Engine } from "../../Engine";
import { Joint } from "./Joint";

/*
 * A fixed joint permits no relative movement between two Rigidbodies, which are glued together.
 */
export class FixedJoint extends Joint {
  protected override _createJoint(actor: IDynamicCollider): IJoint {
    return Engine._nativePhysics.createFixedJoint(actor);
  }
}
