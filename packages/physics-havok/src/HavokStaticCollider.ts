import { Quaternion, Vector3 } from "@galacean/engine";
import { IStaticCollider } from "@galacean/engine-design";
import { HavokCollider } from "./HavokCollider";
import { HavokPhysics } from "./HavokPhysics";

/**
 * Static rigid actor for Havok.
 */
export class HavokStaticCollider extends HavokCollider implements IStaticCollider {
  constructor(havokPhysics: HavokPhysics, position: Vector3, rotation: Quaternion) {
    super(havokPhysics, position, rotation);
    havokPhysics._hk.HP_Body_SetMotionType(this._hkBody, havokPhysics._hk.MotionType.STATIC);
  }
}
