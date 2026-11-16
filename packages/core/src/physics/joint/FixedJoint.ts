import { Engine } from "../../Engine";
import { Rigidbody } from "../Rigidbody";
import { Joint } from "./Joint";

/*
 * A fixed joint permits no relative movement between two Rigidbodies, which are glued together.
 */
export class FixedJoint extends Joint {
  protected _createJoint(): void {
    const bodyInfo = this._bodyInfo;
    bodyInfo.body = this.entity.getComponent(Rigidbody);
    this._nativeJoint = Engine._nativePhysics.createFixedJoint(bodyInfo.body!._getNativeActor());
  }
}
