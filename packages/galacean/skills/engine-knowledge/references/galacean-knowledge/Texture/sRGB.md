# 加载颜色贴图（默认 sRGB） 示例

## Summary
- 展示加载颜色贴图（默认 sRGB）的用法。
- 关键 API：Texture2D, TextureFilterMode, TextureWrapMode

## Code
```ts
import { Engine, PBRMaterial, Texture2D, TextureFilterMode, TextureWrapMode } from "@galacean/engine";

declare const engine: Engine;
declare const material: PBRMaterial;

const albedo = await engine.resourceManager.load<Texture2D>("Textures/albedo.png");
albedo.filterMode = TextureFilterMode.Trilinear;
albedo.wrapModeU = albedo.wrapModeV = TextureWrapMode.Repeat;
material.baseTexture = albedo;
```
