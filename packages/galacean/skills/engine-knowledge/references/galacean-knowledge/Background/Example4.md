# 程序化天空 示例

## Summary
- 展示程序化天空的用法。
- 关键 API：BackgroundMode, SkyProceduralMaterial, PrimitiveMesh

## Code
```ts
import { Background, BackgroundMode, Engine, PrimitiveMesh, SkyProceduralMaterial } from "@galacean/engine";

declare const engine: Engine;
declare const scene: { background: Background };

const mat = new SkyProceduralMaterial(engine);
mat.sunSize = 0.04;

const bg = scene.background;
bg.mode = BackgroundMode.Sky;
bg.sky.material = mat;
bg.sky.mesh = PrimitiveMesh.createSphere(engine);
```
