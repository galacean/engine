# 绑定控制器并播放 示例

## Summary
- 展示绑定控制器并播放的用法。

## Code
```ts
import { Animator, AnimatorController, Engine, Entity } from "@galacean/engine";

declare const engine: Engine;
declare const entity: Entity;

const animator = entity.addComponent(Animator);
animator.animatorController = await engine.resourceManager.load<AnimatorController>("Animations/animator.animCtrl");
animator.play("Idle");
```
