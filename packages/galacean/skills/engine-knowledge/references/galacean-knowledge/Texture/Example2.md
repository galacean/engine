# 加载法线贴图（线性） 示例

## Summary
- 展示加载法线贴图（线性）的用法。
- 关键 API：AssetType, Texture2D

## Code
```ts
import { AssetType, Engine, PBRMaterial, Texture2D } from "@galacean/engine";

declare const engine: Engine;
declare const material: PBRMaterial;

const normal = await engine.resourceManager.load<Texture2D>({
  type: AssetType.Texture,
  url: "Textures/normal.png",
  params: { isSRGBColorSpace: false }
});
material.normalTexture = normal;
```
