# 朝向目标 示例

## Summary
- 展示朝向目标的用法。

## Code
```ts
import { Transform, Vector3 } from "@galacean/engine";

declare const t: Transform;

t.lookAt(new Vector3(0, 1, -5)); // 使 forward(-Z) 指向目标
```
