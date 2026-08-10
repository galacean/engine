# 实体指针拾取 示例

## Summary
- 展示引擎内置指针事件的实体拾取用法；目标实体需要 ColliderShape。
- 关键 API：Script, PointerEventData

## Code
```ts
import { PointerEventData, Script } from "@galacean/engine";

export default class Pickable extends Script {
  onPointerDown(event: PointerEventData): void {
    console.log("Picked entity:", this.entity.name, event.worldPosition);
  }
}
```
