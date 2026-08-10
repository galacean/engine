# 防止极端掉帧跳步 示例

## Summary
- 展示防止极端掉帧跳步的用法。

## Code
```ts
import { Engine } from "@galacean/engine";

declare const engine: Engine;

// 最大步长 50ms，避免长时间后台后角色瞬移
engine.time.maximumDeltaTime = 0.05;
```
