# 包围体与相交测试 示例

## Summary
- 展示包围体与相交测试的用法。
- 关键 API：BoundingBox, BoundingSphere, CollisionUtil, Vector3

## Code
```ts
import { BoundingBox, BoundingSphere, CollisionUtil, Vector3 } from "@galacean/engine";

const min = new Vector3(-1, -1, -1);
const max = new Vector3(1, 1, 1);
const box = new BoundingBox(min, max);

const sphere = new BoundingSphere(new Vector3(0, 0, 0), 0.5);
const intersects = CollisionUtil.intersectsSphereAndBox(sphere, box);
```
