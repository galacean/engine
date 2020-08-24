import { ColliderFeature } from "./ColliderFeature";
import { Scene } from "../Scene";
Scene.registerFeature(ColliderFeature);

//-- colliders
export { ColliderFeature };
export { Collider as ACollider } from "./Collider";
export { ABoxCollider } from "./ABoxCollider";
export { PlaneCollider } from "./PlaneCollider";
export { ASphereCollider } from "./ASphereCollider";
export { BoxCollider } from "./BoxCollider";
export { SphereCollider } from "./SphereCollider";
