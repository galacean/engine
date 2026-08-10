# 监听变换变化 示例

## Summary
- 展示监听变换变化的用法。

## Code
```ts
import { Transform } from "@galacean/engine";

declare const t: Transform;

const flag = t.registerWorldChangeFlag();
// 在更新中
if (flag.flag) {
  flag.flag = false;
  // 世界矩阵已变，可更新依赖数据
}
```
