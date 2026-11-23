import { IDynamicActor, IJoint, IPhysicsScene } from "@galacean/engine-design";
import { Joint } from "./Joint";

/**
 * Locks the relative position and rotation of the connected bodies.
 */
export class FixedJoint extends Joint {
  protected override _createJoint(physicsScene: IPhysicsScene, actor: IDynamicActor): IJoint {
    return physicsScene.createFixedJoint(actor);
  }
}
