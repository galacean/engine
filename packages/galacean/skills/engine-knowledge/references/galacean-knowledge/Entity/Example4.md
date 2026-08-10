# 批量获取组件（含子节点） 示例

## Summary
- 展示批量获取组件（含子节点）的用法。
- 关键 API：Script

## Code
```ts
import { Entity, Script } from "@galacean/engine";

declare const root: Entity;

const scripts: Script[] = [];
root.getComponentsIncludeChildren(Script, scripts); // 结果写入传入数组，避免额外分配
```
