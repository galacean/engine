import { Scene } from "@alipay/o3-core";
import { LightFeature, hasLight } from "./LightFeature";
Scene.registerFeature(LightFeature);

(Scene.prototype as any).hasLight = hasLight;

//-- 数据类
export { LightFeature };
export { AAmbientLight } from "./AAmbientLight";
export { ADirectLight } from "./ADirectLight";
export { APointLight } from "./APointLight";
export { ASpotLight } from "./ASpotLight";
export { AEnvironmentMapLight } from "./AEnvironmentMapLight";
export { ALight } from "./ALight";
