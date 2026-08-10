# 监听世界变换变化 示例

## Summary
- 展示监听世界变换变化的用法。

## Code
```ts
import { Entity } from "@galacean/engine";

declare const player: Entity;

const flag = player.registerWorldChangeFlag();

// 每帧检查是否变换更新
if (flag.flag) {
  flag.flag = false; // 重置
  // 处理变换变化
}
```
