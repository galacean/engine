import {Scene} from '@alipay/r3-core';
import {FogFeature, hasFogFeature, getFogMacro, bindFogToMaterial} from './FogFeature';

Scene.registerFeature(FogFeature);
(Scene.prototype as any).hasFogFeature = hasFogFeature;
(Scene.prototype as any).getFogMacro = getFogMacro;
(Scene.prototype as any).bindFogToMaterial = bindFogToMaterial;

export {ALinearFog} from './ALinearFog';
export {AEXP2Fog} from './AEXP2Fog';
export {FogFeature};
