# 碰撞事件 示例

## Summary
- 展示碰撞事件的用法。
- 关键 API：Collision

## Code
```ts
import { Collision, Script } from "@galacean/engine";

export default class Bullet extends Script {
  onCollisionEnter(collision: Collision) {
    console.log("hit", collision.shape.collider.entity.name);
    this.entity.destroy();
  }
}
```
