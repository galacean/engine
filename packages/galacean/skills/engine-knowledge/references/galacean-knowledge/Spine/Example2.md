# 动画控制 示例

## Summary
- 展示动画控制的用法。

## Code
```ts
import { SpineAnimationRenderer } from "@galacean/engine-spine";

declare const spine: SpineAnimationRenderer;

const { state } = spine; // AnimationState
state.setAnimation(0, "walk", true);
state.addAnimation(0, "attack", false, 0.1); // 混合到攻击
state.setEmptyAnimation(1, 0.2); // 清空轨道
```
