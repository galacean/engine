# 实例化 Prefab 示例

## Summary
- 展示实例化 Prefab的用法。
- 关键 API：AssetType, PrefabResource

## Code
```ts
import { AssetType, Engine, PrefabResource, Scene } from "@galacean/engine";

declare const engine: Engine;
declare const scene: Scene;

const prefab = await engine.resourceManager.load<PrefabResource>({
  type: AssetType.Prefab,
  url: "prefabs/enemy.prefab"
});

const enemy = prefab.instantiate();
enemy.transform.setPosition(0, 0, -5);
scene.addRootEntity(enemy);
```
