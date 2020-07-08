import { Scene } from "@alipay/o3-core";
import { FogFeature, hasFogFeature, getFogMacro, bindFogToMaterial } from "./FogFeature";

Scene.registerFeature(FogFeature);
(Scene.prototype as any).hasFogFeature = hasFogFeature;
(Scene.prototype as any).getFogMacro = getFogMacro;
(Scene.prototype as any).bindFogToMaterial = bindFogToMaterial;

export { LinearFog } from "./LinearFog";
export { EXP2Fog } from "./EXP2Fog";
export { FogFeature };
