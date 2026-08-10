# 自定义脚本组件 示例

## Summary
- 展示自定义脚本组件的用法。
- 关键 API：Script, Vector3

## Code
```ts
import { Entity, Script, Vector3 } from "@galacean/engine";

declare const root: Entity;

class Spin extends Script {
  onUpdate(deltaTime: number) {
    this.entity.transform.rotate(0, 60 * deltaTime, 0);
  }
  onDisable() {
    // 清理状态或停止特效
  }
}

const cube = root.createChild("Cube");
cube.addComponent(Spin);
```
