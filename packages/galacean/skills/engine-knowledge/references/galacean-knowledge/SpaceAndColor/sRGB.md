# sRGB 纹理标记 示例

## Summary
- 展示sRGB 纹理标记的用法。
- 关键 API：AssetType, Texture2D

## Code
```ts
import { AssetType, Engine, Texture2D } from "@galacean/engine";

declare const engine: Engine;

// 颜色贴图：默认 isSRGBColorSpace = true
const albedo = await engine.resourceManager.load<Texture2D>("Textures/albedo.png");

// 法线/数据贴图：关闭 sRGB
const normal = await engine.resourceManager.load<Texture2D>({
  type: AssetType.Texture,
  url: "Textures/normal.png",
  params: { isSRGBColorSpace: false }
});
```
