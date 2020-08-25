import { Scene } from "../Scene";
import { bindFogToMaterial, FogFeature, getFogMacro, hasFogFeature } from "./FogFeature";

Scene.registerFeature(FogFeature);
(Scene.prototype as any).hasFogFeature = hasFogFeature;
(Scene.prototype as any).getFogMacro = getFogMacro;
(Scene.prototype as any).bindFogToMaterial = bindFogToMaterial;

export { EXP2Fog } from "./EXP2Fog";
export { LinearFog } from "./LinearFog";
export { FogFeature };
