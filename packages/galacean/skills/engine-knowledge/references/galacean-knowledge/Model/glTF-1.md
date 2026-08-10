# 播放 glTF 动画 示例

## Summary
- 展示播放 glTF 动画的用法。
- 关键 API：Animator

## Code
```ts
import { Animator, Entity } from "@galacean/engine";

declare const inst: Entity;

const animator = inst.getComponent(Animator);
// 若 glTF 已生成 AnimatorController，可直接播放对应状态名
animator.play("Walk");
// 若无控制器，可创建并将 glTF 的 AnimationClip 绑定到 AnimatorState 后再播放
```
