import { Scene } from '@alipay/o3-core';
import { ColliderFeature } from './ColliderFeature';

Scene.registerFeature( ColliderFeature );

//-- colliders
export { ColliderFeature };
export { ACollider } from './ACollider';
export { ABoxCollider } from './ABoxCollider';
export { APlaneCollider } from './APlaneCollider';
export { ASphereCollider } from './ASphereCollider';
