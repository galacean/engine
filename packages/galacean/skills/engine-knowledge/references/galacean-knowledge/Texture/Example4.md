# 加载编辑器导出的纹理资产 示例

## Summary
- 展示加载编辑器导出的纹理资产的用法。
- 关键 API：Texture2D, AssetType

## Code
```ts
import { AssetType, Engine, PBRMaterial, Texture2D } from "@galacean/engine";

declare const engine: Engine;
declare const material: PBRMaterial;

// 使用稳定逻辑路径：与 Editor VFS 路径相同，但没有前导 /
const tex = await engine.resourceManager.load<Texture2D>({
  type: AssetType.Texture,
  url: "Textures/brick_wall.png"
});
material.baseTexture = tex;
```
