# 慢动作与暂停 示例

## Summary
- 展示慢动作与暂停的用法。

## Code
```ts
import { Engine } from "@galacean/engine";

declare const engine: Engine;

// 慢动作：时间减半
engine.time.timeScale = 0.5;

// 全局暂停逻辑（渲染仍执行）
engine.time.timeScale = 0;
```
