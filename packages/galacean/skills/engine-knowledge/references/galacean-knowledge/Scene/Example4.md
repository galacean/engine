# 查找实体（按名/路径） 示例

## Summary
- 展示查找实体（按名/路径）的用法。

## Code
```ts
import { Scene } from "@galacean/engine";

declare const scene: Scene;

// 名称查找（返回首个同名）
const player = scene.findEntityByName("Player");

// 路径查找（Root/Child/SubChild）
const head = scene.findEntityByPath("Root/NPC/Head");
```
