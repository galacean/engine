# 触发器事件 示例

## Summary
- 使用 `onTriggerEnter/Stay/Exit` 监听触发体交互（ColliderShape 需 `isTrigger=true`，另一方需 Collider+Rigidbody）。
- 关键 API：Script, ColliderShape, Vector3

## Code
```ts
import { ColliderShape, Script, Vector3 } from "@galacean/engine";

export default class TriggerZone extends Script {
  onTriggerEnter(other: ColliderShape) {
    console.log("enter trigger:", other.collider.entity.name);
  }

  onTriggerStay(other: ColliderShape) {
    // 轻推目标，演示持续触发
    other.collider.entity.transform.position.add(new Vector3(0, 0.01, 0));
  }

  onTriggerExit(other: ColliderShape) {
    console.log("exit trigger:", other.collider.entity.name);
  }
}
```
