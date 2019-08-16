import { Scene } from '@alipay/r3-core';
import { LightFeature, hasLight, bindLightsToMaterial } from './LightFeature';
Scene.registerFeature( LightFeature );

(Scene.prototype as any).hasLight = hasLight;
(Scene.prototype as any).bindLightsToMaterial = bindLightsToMaterial;

//-- 数据类
export { LightFeature };
export { AAmbientLight } from './AAmbientLight';
export { ADirectLight } from './ADirectLight';
export { APointLight } from './APointLight';
export { ASpotLight } from './ASpotLight';
export { ALight } from './ALight';

