import { IStaticCollider } from "@galacean/engine-design";
import { HavokCollider } from "./HavokCollider";

/**
 * Static rigid actor for Havok.
 * `HP_Body_Create()` defaults to `MotionType.STATIC`.
 */
export class HavokStaticCollider extends HavokCollider implements IStaticCollider {}
