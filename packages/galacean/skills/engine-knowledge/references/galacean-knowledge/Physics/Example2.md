# 刚体+盒形状 示例

## Summary
- 展示刚体+盒形状的用法。
- 关键 API：DynamicCollider, BoxColliderShape, Vector3

## Code
```ts
import { BoxColliderShape, DynamicCollider, Entity, Vector3 } from "@galacean/engine";

declare const root: Entity;

const box = root.createChild("Box");
const collider = box.addComponent(DynamicCollider);
const shape = new BoxColliderShape();
shape.size.set(1, 1, 1);
collider.addShape(shape);

collider.mass = 2;
collider.applyForce(new Vector3(0, 5, 0));
```
