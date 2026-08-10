# 帧率无关的移动 示例

## Summary
- 展示帧率无关的移动的用法。

## Code
```ts
import { Script } from "@galacean/engine";

export default class ForwardMover extends Script {
  onUpdate(deltaTime: number): void {
    const speed = 5; // m/s
    this.entity.transform.translate(0, 0, speed * deltaTime);
  }
}
```
