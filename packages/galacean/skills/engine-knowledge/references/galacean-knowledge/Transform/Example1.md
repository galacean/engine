# 设置位置与旋转 示例

## Summary
- 展示设置位置与旋转的用法。
- 关键 API：Vector3, Quaternion

## Code
```ts
import { Entity, Quaternion, Vector3 } from "@galacean/engine";

declare const entity: Entity;

const t = entity.transform;
t.position.set(0, 1, 0);
t.rotation.set(0, 45, 0); // 角度制
// 或者直接用四元数
// t.rotationQuaternion = Quaternion.rotationYawPitchRoll(...);
```
