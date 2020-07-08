import { Scene } from "@alipay/o3-core";
import { ColliderFeature } from "./ColliderFeature";

Scene.registerFeature(ColliderFeature);

//-- colliders
export { ColliderFeature };
export { Collider as ACollider } from "./Collider";
export { ABoxCollider } from "./ABoxCollider";
export { PlaneCollider } from "./PlaneCollider";
export { ASphereCollider } from "./ASphereCollider";
export { BoxCollider } from "./BoxCollider";
export { SphereCollider } from "./SphereCollider";
