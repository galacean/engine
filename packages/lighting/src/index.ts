import { Scene } from "@alipay/o3-core";
import { LightFeature, hasLight } from "./LightFeature";
Scene.registerFeature(LightFeature);

(Scene.prototype as any).hasLight = hasLight;

//-- 数据类
export { LightFeature };
export { AmbientLight } from "./AmbientLight";
export { DirectLight } from "./DirectLight";
export { PointLight } from "./PointLight";
export { SpotLight } from "./SpotLight";
export { EnvironmentMapLight } from "./EnvironmentMapLight";
export { Light } from "./Light";
