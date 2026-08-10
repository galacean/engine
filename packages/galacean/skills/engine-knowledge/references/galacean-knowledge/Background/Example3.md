# 天空盒 示例

## Summary
- 展示天空盒的用法。
- 关键 API：BackgroundMode, AssetType, TextureCube, SkyBoxMaterial, PrimitiveMesh

## Code
```ts
import { AssetType, Background, BackgroundMode, Engine, PrimitiveMesh, SkyBoxMaterial, TextureCube } from "@galacean/engine";

declare const engine: Engine;
declare const scene: { background: Background };

// 使用已导入并注册的立方体纹理；单张 .hdr 会加载为 Texture2D，不会自动转换成 TextureCube
const cube = await engine.resourceManager.load<TextureCube>({ type: AssetType.KTXCube, url: "Sky/skybox.ktx" });
const mat = new SkyBoxMaterial(engine);
mat.texture = cube;

const bg = scene.background;
bg.mode = BackgroundMode.Sky;
bg.sky.material = mat;
bg.sky.mesh = PrimitiveMesh.createCuboid(engine, 2, 2, 2);
```
