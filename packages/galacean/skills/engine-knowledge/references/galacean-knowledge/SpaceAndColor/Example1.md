# 屏幕坐标转世界坐标 示例

## Summary
- 展示屏幕坐标转世界坐标的用法。
- 关键 API：Vector3

## Code
```ts
import { Camera, Vector3 } from "@galacean/engine";

declare const camera: Camera;
declare const screenX: number;
declare const screenY: number;

const world = new Vector3();
// point.z 为“距离相机的世界单位”，非 0~1 深度
camera.screenToWorldPoint(new Vector3(screenX, screenY, 10), world);
```
