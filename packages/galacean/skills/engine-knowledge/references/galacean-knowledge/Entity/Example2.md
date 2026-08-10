# 查找与路径 示例

## Summary
- 展示查找与路径的用法。

## Code
```ts
import { Entity } from "@galacean/engine";

declare const root: Entity;

// 名称（同级/子级第一匹配）
const npc = root.findByName("NPC");

// 路径：使用 '/' 分隔层级，默认相对当前实体；如需绝对可前置 '/'
const head = root.findByPath("NPC/Head");   // 相对 root
const head2 = root.findByPath("/Root/NPC/Head"); // 绝对路径（包含根名）
```
