# 克隆实体树 示例

## Summary
- 展示克隆实体树的用法。

## Code
```ts
import { Entity } from "@galacean/engine";

declare const root: Entity;

const template = root.findByName("EnemyTemplate");
const enemy = template.clone();
enemy.name = "Enemy_01";
root.addChild(enemy);
enemy.transform.setPosition(3, 0, -5);
```
