# 天空盒立方体纹理示例

## Summary
- 展示给天空盒绑定已导入立方体纹理的用法。单张 `.hdr` 由当前 Texture loader 解码为 `Texture2D`，不会自动转换为 `TextureCube`。
- 关键 API：AssetType, TextureCube

## Code
```ts
import { AssetType, Engine, SkyBoxMaterial, TextureCube } from "@galacean/engine";

declare const engine: Engine;
declare const skyMaterial: SkyBoxMaterial;

const cube = await engine.resourceManager.load<TextureCube>({
  type: AssetType.KTXCube,
  url: "Sky/skybox.ktx"
});
skyMaterial.texture = cube;
```
