# 局部体积后处理 示例

## Summary
- 展示局部体积后处理的用法。
- 关键 API：StaticCollider, BoxColliderShape

## Code
```ts
import { BoxColliderShape, PostProcess, StaticCollider } from "@galacean/engine";

declare const pp: PostProcess;

pp.isGlobal = false;
pp.blendDistance = 3;
pp.priority = 1;
// Local PostProcess 的范围由 Collider 与 ColliderShape 定义。
const collider = pp.entity.addComponent(StaticCollider);
const shape = new BoxColliderShape();
shape.size.set(6, 3, 6);
collider.addShape(shape);
```
