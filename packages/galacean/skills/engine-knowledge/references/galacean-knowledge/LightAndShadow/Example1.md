# 方向光与阴影 示例

## Summary
- 展示方向光与阴影的用法。
- 关键 API：DirectLight, Color, ShadowCascadesMode, ShadowResolution, ShadowType

## Code
```ts
import { Color, DirectLight, Entity, Scene, ShadowCascadesMode, ShadowResolution, ShadowType } from "@galacean/engine";

declare const root: Entity;
declare const scene: Scene;

const sunEntity = root.createChild("Sun");
const sun = sunEntity.addComponent(DirectLight);
sun.color = new Color(1.2, 1.14, 1.08, 1); // 亮度直接编码在 HDR 颜色中
sun.shadowType = ShadowType.SoftHigh;
sun.shadowBias = 0.0015;
sun.shadowNormalBias = 0.4;

scene.sun = sun; // 指定主光源
scene.castShadows = true;
scene.shadowResolution = ShadowResolution.High;
scene.shadowCascades = ShadowCascadesMode.FourCascades;
```
