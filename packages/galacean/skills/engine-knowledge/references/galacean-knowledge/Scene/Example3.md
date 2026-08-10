# 设置主光源与环境光 示例

## Summary
- 展示设置主光源与环境光的用法。
- 关键 API：DirectLight, AmbientLight, Color

## Code
```ts
import { AmbientLight, Color, DirectLight, Engine, Scene } from "@galacean/engine";

declare const engine: Engine;
declare const scene: Scene;

const sunEntity = scene.createRootEntity("Sun");
const sun = sunEntity.addComponent(DirectLight);
scene.sun = sun; // 指定主光源

const ambient = new AmbientLight(engine);
ambient.diffuseSolidColor.set(0.2, 0.25, 0.3, 1);
scene.ambientLight = ambient;
```
