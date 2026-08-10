# 状态机脚本回调 示例

## Summary
- 在 Animator 状态上挂载 `StateMachineScript` 以获得进入/更新/退出回调。
- 关键 API：StateMachineScript, AudioSource

## Code
```ts
import { Animator, AnimatorState, AudioSource, StateMachineScript } from "@galacean/engine";

export default class AttackStateLogic extends StateMachineScript {
  onStateEnter(animator: Animator): void {
    animator.entity.getComponent(AudioSource)?.play();
  }
  onStateUpdate(animator: Animator, state: AnimatorState, layerIndex: number): void {
    // 例如在攻击状态推进计时，或做逐帧检测
  }
  onStateExit(animator: Animator): void {
    // 清理特效/恢复状态
  }
}
```
