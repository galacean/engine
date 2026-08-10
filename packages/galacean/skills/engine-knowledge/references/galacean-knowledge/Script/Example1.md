# 旋转脚本 示例

## Summary
- 展示旋转脚本的用法。
- 关键 API：Script

## Code
```ts
import { Script } from "@galacean/engine";

export default class Spin extends Script {
  speed = 90;
  onUpdate(deltaTime: number) {
    this.entity.transform.rotate(0, this.speed * deltaTime, 0);
  }
}
```
