# 空间转换常用代码 示例

## Summary
- 展示相机的屏幕/视口/世界空间互转与射线生成。
- 关键 API：worldToScreenPoint, screenToWorldPoint, viewportToWorldPoint, screenPointToRay

## Code
```ts
import { Camera, Entity, Ray, Vector2, Vector3 } from "@galacean/engine";

declare const camera: Camera;
declare const pointer: { x: number; y: number };
declare const targetEntity: Entity;

// 世界 → 屏幕（像素）。out.z 是与相机的距离
const screen = new Vector3();
camera.worldToScreenPoint(targetEntity.transform.worldPosition, screen);

// 屏幕 → 世界。point.z 代表距相机的世界单位距离
const world = new Vector3();
camera.screenToWorldPoint(new Vector3(pointer.x, pointer.y, 5), world);

// Viewport → 世界。point.z 为距相机的距离，x/y 在 [0,1]
const worldCenter = new Vector3();
camera.viewportToWorldPoint(new Vector3(0.5, 0.5, 10), worldCenter);

// 屏幕点射线（用于拾取/交互）
const ray = new Ray();
camera.screenPointToRay(new Vector2(pointer.x, pointer.y), ray);
```
