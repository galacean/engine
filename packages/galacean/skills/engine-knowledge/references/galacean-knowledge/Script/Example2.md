# 指针点击（实体拾取）与全局监听 示例

## Summary
- 展示指针点击（实体拾取）与全局监听的用法。
- 关键 API：Script, PointerEventData, PointerButton

## Code
```ts
import { Script, PointerEventData, PointerButton } from "@galacean/engine";

export default class ClickHandler extends Script {
  // 依赖实体的碰撞体组件，才能触发 onPointerClick
  onPointerClick(event: PointerEventData) {
    console.log("clicked", this.entity.name, "at", event.worldPosition);
  }

  // 全局监听：不依赖碰撞体，直接查询输入
  onUpdate() {
    const input = this.engine.inputManager;
    if (input.isPointerDown(PointerButton.Primary)) {
      console.log("screen pointer pressed (anywhere)");
    }
  }
}
```
