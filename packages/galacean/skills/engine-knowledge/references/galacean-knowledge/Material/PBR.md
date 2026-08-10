# PBR 材质 示例

## Summary
- 展示PBR 材质的用法。
- 关键 API：PBRMaterial, Texture2D
- 本示例只适用于脚本自己 `new PBRMaterial(engine)` 得到的确定实例；不要把它当作 Editor `.mat` 属性注入或 `renderer.getInstanceMaterial()` 的返回类型。

## Code
```ts
import { Engine, PBRMaterial, Texture2D } from "@galacean/engine";

declare const engine: Engine;

const mat = new PBRMaterial(engine);
mat.baseColor.set(1, 1, 1, 1);
mat.metallic = 0.5;
mat.roughness = 0.3;
mat.baseTexture = await engine.resourceManager.load<Texture2D>("albedo.png");

// 透明渲染的队列、混合和深度写入由公开属性一致配置。
mat.isTransparent = true;
```
