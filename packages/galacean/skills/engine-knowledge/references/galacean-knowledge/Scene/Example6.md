# 在组件/脚本中获取场景 示例

## Summary
- 展示在组件/脚本中获取场景的用法。
- 关键 API：Script

## Code
```ts
import { Script } from "@galacean/engine";

export default class FollowCamera extends Script {
  onUpdate() {
    // this.entity 是组件挂载的实体
    // this.scene 直接访问所属场景（Script 继承 Component）
    const scene = this.scene;
    // ... 跟随逻辑
  }
}
```
