# Galacean Animation

## 它是什么
- 状态机驱动的动画系统：`Animator` 组件 + `AnimatorController`（层/状态机/参数） + `AnimationClip`（关键帧曲线、事件）。
- 支持多层混合（Override/Additive）、参数驱动条件、过渡时间/偏移、动画事件与状态机脚本回调。

## 简述
- `Animator` 挂在实体上，持有 `animatorController`、`cullingMode`、`speed` 等；可在代码中设置参数、切换状态。
- `AnimatorController` 包含多个 `AnimatorControllerLayer`，每层有状态机与混合模式；参数通过 `setParameterValue` 及触发器 `activateTriggerParameter/deactivateTriggerParameter` 传递。
- `AnimatorStateMachine` 由 `AnimatorState` + `AnimatorTransition` 组成，状态绑定 `AnimationClip`，可配置速度/循环/时间范围；过渡定义 `exitTime`、`duration`、`conditions`。
- `AnimationClip` 包含曲线、事件（回调到脚本）、插值模式；可离线导入（glTF 动画）或代码创建。

## 关联
- 组件：`Animator`
- 资产：`AnimatorController`、`AnimationClip`（通常来自 glTF 动画或独立 Clip 资产）
- 类/接口：`AnimatorControllerLayer`、`AnimatorStateMachine`、`AnimatorState`、`AnimatorTransition`、`AnimatorCondition`、`AnimationEvent`
- 脚本：`StateMachineScript`（进入/退出/更新回调）

## 怎么用
1) 加载或创建 `AnimatorController`，绑定到 `Animator` 组件。
2) 配置参数与状态机（编辑器或代码）；运行时通过 `setXXX` 更新参数，触发过渡。
3) 使用 `play/crossFade` 或状态机自动过渡控制动画；需要混合叠加时使用多层与 Additive 模式。

## 状态机脚本提示
- 在状态上可添加 `StateMachineScript`（或自定义继承它的类），获得状态生命周期回调：`onStateEnter(stateInfo)`、`onStateUpdate(stateInfo, deltaTime)`、`onStateExit(stateInfo)`，可用于播放音效、特效、位移等。
- 示例：参考同目录 `StateMachineScript.md`。
- 在编辑器或代码中将脚本挂到目标 `AnimatorState`，进入/更新/退出该状态时会触发对应回调。

## Best Practices
- 将循环/非循环动作分开，使用 `exitTime` + `conditions` 控制过渡；短动作优先用 Trigger/Bool 触发。
- 多层混合时，基础层使用 Override，叠加层使用 Additive，设置合理权重，避免姿态冲突。
- 对需要同步位移的动作使用脚本处理 RootMotion（读取动画位移并应用 Transform），避免在剪辑内硬编码。
- 动画事件应做去抖/防重复处理，避免在高帧率下多次触发；回调逻辑保持轻量。
- 大量 Animator 实例时复用控制器资源，减少重复加载；裁剪模式设置为 `CullingMode.CullUpdateTransforms` 在离屏时节省开销。

## Few-shot（常见需求提示）
- “播放一次攻击再回 idle” → `crossFade("Attack", 0.1);` 在状态机中设置 exitTime 过渡回 Idle 或 `addAnimation`。
- “上半身持枪，下半身跑步” → 两层：下半身层 Override 播放跑步，上半身层 Additive 播放持枪/开火，权重调整。
- “按键触发动作” → `activateTriggerParameter("Fire")` 配合过渡条件 Trigger。
- “运行时替换动画片段” → 通过 `AnimatorState.clip = newClip` 或重建控制器层状态。

## Notes / Warning
- 状态名/参数名需与控制器定义一致；拼写错误不会报错但不会触发过渡。
- CrossFade 与状态机过渡叠加时可能出现双重混合，注意过渡配置避免过度模糊。
- glTF 导入的动画共享 `AnimationClip`；修改共享 Clip 会影响所有使用者，必要时克隆。
- Trigger 参数在过渡消费后会被内部清空；也可通过 `deactivateTriggerParameter` 手动重置。
