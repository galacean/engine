# 释放未引用资产 示例

## Summary
- 展示释放未引用资产的用法。

## Code
```ts
import { Engine } from "@galacean/engine";

declare const engine: Engine;

// 移除使用资产的实体/组件后
engine.resourceManager.gc(); // 基于引用计数释放未被持有的资源
```
