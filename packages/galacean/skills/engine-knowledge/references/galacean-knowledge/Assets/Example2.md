# 批量加载与缓存复用 示例

## Summary
- 展示批量加载与缓存复用的用法。

## Code
```ts
import { AssetPromise, AssetType, Engine, PrefabResource, Texture2D } from "@galacean/engine";

declare const engine: Engine;

const [tex, prefab] = await AssetPromise.all([
  engine.resourceManager.load<Texture2D>("textures/diffuse.png"),
  engine.resourceManager.load<PrefabResource>({ type: AssetType.Prefab, url: "enemy.prefab" })
]);

// 之后可直接从缓存取
const cached = engine.resourceManager.getFromCache<Texture2D>("textures/diffuse.png");
```
