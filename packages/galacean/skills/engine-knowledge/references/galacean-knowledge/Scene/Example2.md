# 背景、雾、阴影 示例

## Summary
- 展示背景、雾、阴影的用法。
- 关键 API：BackgroundMode, ShadowCascadesMode, FogMode, Color, Vector3

## Code
```ts
import { BackgroundMode, Color, FogMode, Scene, ShadowCascadesMode, Vector3 } from "@galacean/engine";

declare const scene: Scene;

// 背景：纯色
scene.background.mode = BackgroundMode.SolidColor;
scene.background.solidColor = new Color(0.1, 0.1, 0.15, 1);

// 雾：线性雾
scene.fogMode = FogMode.Linear;
scene.fogColor = new Color(0.6, 0.7, 0.8, 1);
scene.fogStart = 10;
scene.fogEnd = 80;

// 阴影：四级级联，透明阴影
scene.castShadows = true;
scene.shadowCascades = ShadowCascadesMode.FourCascades;
scene.shadowFourCascadeSplits = new Vector3(0.067, 0.2, 0.467);
scene.shadowDistance = 100;
scene.shadowFadeBorder = 0.1;
scene.enableTransparentShadow = true; // 半透明投影
```
