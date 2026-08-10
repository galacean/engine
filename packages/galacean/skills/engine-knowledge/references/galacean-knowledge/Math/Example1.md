# 向量与四元数 示例

## Summary
- 展示向量与四元数的用法。
- 关键 API：Vector3, Quaternion, MathUtil

## Code
```ts
import { Vector3, Quaternion, MathUtil } from "@galacean/engine";

const dir = new Vector3(1, 0, 1).normalize();
const rot = new Quaternion();
Quaternion.rotationYawPitchRoll(Math.PI / 2, 0, 0, rot);

// 角度 ↔ 弧度
const yawDeg = 90;
const yawRad = yawDeg * MathUtil.degreeToRadFactor;
```
