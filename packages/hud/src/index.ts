import { Scene } from '@alipay/r3-core';
import { HUDFeature, hasHUDWidget } from './HUDFeature';

Scene.registerFeature( HUDFeature );
(Scene.prototype as any).hasHUDWidget = hasHUDWidget;

export { HUDFeature };
export { AHUDWidget } from './AHUDWidget';
