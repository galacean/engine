# 环境光与 AO 示例

## Summary
- 展示环境光与 AO的用法。
- 关键 API：AmbientLight, Color

## Code
```ts
import { AmbientLight, Color, Engine, Scene } from "@galacean/engine";

declare const engine: Engine;
declare const scene: Scene;

const ambient = new AmbientLight(engine);
ambient.diffuseSolidColor = new Color(0.2, 0.23, 0.28, 1);
scene.ambientLight = ambient;

scene.ambientOcclusion.intensity = 0.5;
scene.ambientOcclusion.radius = 0.5;
```
