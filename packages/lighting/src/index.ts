import { Scene } from "@alipay/o3-core";
import { LightFeature, hasLight } from "./LightFeature";
Scene.registerFeature(LightFeature);

(Scene.prototype as any).hasLight = hasLight;

//-- 数据类
export { LightFeature };
export { AmbientLight as AAmbientLight } from "./AmbientLight";
export { DirectLight as ADirectLight } from "./DirectLight";
export { PointLight as APointLight } from "./PointLight";
export { SpotLight as ASpotLight } from "./SpotLight";
export { AEnvironmentMapLight } from "./EnvironmentMapLight";
export { Light as ALight } from "./Light";
