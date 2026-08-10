# 加载 glTF 并挂到场景 示例

## Summary
- 展示加载 glTF 并挂到场景的用法。
- 关键 API：AssetType, GLTFResource

## Code
```ts
import { AssetType, Engine, GLTFResource, Scene } from "@galacean/engine";

declare const engine: Engine;
declare const scene: Scene;

const gltf = await engine.resourceManager.load<GLTFResource>({
  type: AssetType.GLTF,
  url: "models/robot.glb"
});

const inst = gltf.defaultSceneRoot; // 实体树
scene.addRootEntity(inst);
```
