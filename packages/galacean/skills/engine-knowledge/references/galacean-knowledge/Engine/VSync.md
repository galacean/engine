# 关闭 VSync，固定帧率 示例

## Summary
- 展示关闭 VSync，固定帧率的用法。

## Code
```ts
import { Engine } from "@galacean/engine";

declare const engine: Engine;

engine.vSyncCount = 0;        // 关闭垂直同步
engine.targetFrameRate = 120; // 目标帧率（仅在 vSyncCount=0 时生效）
engine.run();
```
