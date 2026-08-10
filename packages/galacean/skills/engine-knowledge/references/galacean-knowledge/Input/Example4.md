# 屏幕坐标转世界坐标与射线 示例

## Summary
- 展示屏幕坐标转世界坐标与射线的用法。
- 关键 API：Vector3, Vector2, Ray, Keys, PointerButton, HitResult

## Code
```ts
import { Camera, Engine, HitResult, Ray, Scene, Vector2, Vector3 } from "@galacean/engine";

declare const camera: Camera;
declare const scene: Scene;
declare const engine: Engine;
declare const pointer: { x: number; y: number };

// 屏幕坐标（像素）转世界坐标，z 为距相机的世界单位
const worldPos = new Vector3();
camera.screenToWorldPoint(new Vector3(pointer.x, pointer.y, 5), worldPos);

// 屏幕坐标转射线，用于物理/自定义拾取
const ray = new Ray();
camera.screenPointToRay(new Vector2(pointer.x, pointer.y), ray);

// 用射线做物理拾取（需物理后端和碰撞体）
const hit = new HitResult();
if (scene.physics.raycast(ray, 100, hit)) {
  console.log("Hit entity:", hit.entity.name);
}

// 获取当前屏幕上的所有触控点（Pointer），查看位置/阶段
for (const p of engine.inputManager.pointers) {
  console.log(`pointer id=${p.id}, pos=(${p.position.x}, ${p.position.y}), phase=${p.phase}`);
}
```
