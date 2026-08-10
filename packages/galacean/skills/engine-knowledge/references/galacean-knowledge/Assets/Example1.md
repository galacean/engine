# 加载与进度/取消 示例

## Summary
- 展示加载与进度/取消的用法。
- 关键 API：AssetType, GLTFResource

## Code
```ts
import { AssetType, Engine, GLTFResource } from "@galacean/engine";

declare const engine: Engine;

const promise = engine.resourceManager
  .load<GLTFResource>({ type: AssetType.GLTF, url: "model.gltf", retryCount: 3 })
  .onProgress((p) => console.log("progress", p));

// 需要时取消
promise.cancel(); // 或 resourceManager.cancelNotLoaded("model.gltf");
```
