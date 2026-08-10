# 射线拾取 示例

## Summary
- 展示射线拾取的用法。
- 关键 API：Ray, HitResult

## Code
```ts
import { Entity, HitResult, Ray, Scene } from "@galacean/engine";

declare const cameraEntity: Entity;
declare const scene: Scene;

const ray = new Ray(cameraEntity.transform.worldPosition, cameraEntity.transform.worldForward);
const hit = new HitResult();
if (scene.physics.raycast(ray, 100, hit)) {
  console.log("hit entity", hit.entity.name);
}
```
