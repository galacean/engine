# 脚本监听指针 示例

## Summary
- 展示脚本监听指针的用法。

## Code
```ts
import { PointerEventData, Script } from "@galacean/engine";

export default class ClickReporter extends Script {
  onPointerClick(event: PointerEventData): void {
    console.log("screen", event.pointer.position, "world", event.worldPosition);
  }
}
```
