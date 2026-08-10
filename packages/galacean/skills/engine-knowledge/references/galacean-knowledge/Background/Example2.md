# 纹理背景 示例

## Summary
- 展示纹理背景的用法。
- 关键 API：AssetType, BackgroundMode, BackgroundTextureFillMode, Texture2D

## Code
```ts
import { AssetType, Background, BackgroundMode, BackgroundTextureFillMode, Engine, Texture2D } from "@galacean/engine";

declare const engine: Engine;
declare const scene: { background: Background };

const tex = await engine.resourceManager.load<Texture2D>({
  type: AssetType.Texture,
  url: "Textures/bg.png"
});
const bg = scene.background;
bg.mode = BackgroundMode.Texture;
bg.texture = tex;
bg.textureFillMode = BackgroundTextureFillMode.Fill;
```
