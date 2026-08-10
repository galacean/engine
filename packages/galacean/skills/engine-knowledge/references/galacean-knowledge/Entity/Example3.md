# 克隆实体树 示例

## Summary
- 展示克隆实体树的用法。

## Code
```ts
import { Entity } from "@galacean/engine";

declare const root: Entity;
declare const player: Entity;

// 克隆 player 及其子节点、组件
const clone = player.clone();
clone.name = "PlayerCopy";
root.addChild(clone);
```
