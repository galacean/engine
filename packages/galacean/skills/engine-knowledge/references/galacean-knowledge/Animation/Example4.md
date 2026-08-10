# 动画事件回调 示例

## Summary
- 展示动画事件回调的用法。

## Code
```ts
import { Script } from "@galacean/engine";

// 在 AnimationClip 事件表中绑定函数名
export default class AttackScript extends Script {
  // 将 AnimationEvent.functionName 配置为 "onHit"。
  onHit(damage: number): void {
    this.applyDamage(damage);
  }

  private applyDamage(damage: number): void {
    console.log("damage", damage);
  }
}
```
