# 移动与旋转 示例

## Summary
- 展示移动与旋转的用法。
- 关键 API：Vector3

## Code
```ts
import { Transform, Vector3 } from "@galacean/engine";

declare const t: Transform;

// 局部坐标平移 1m
t.translate(new Vector3(1, 0, 0), true);
// 绕 Y 轴旋转 90°
t.rotate(new Vector3(0, 90, 0), true);
```
