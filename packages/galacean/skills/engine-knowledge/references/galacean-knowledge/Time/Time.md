# Galacean Time

## 它是什么
- 引擎时间管理器，暴露帧间隔、累计时间与时间缩放，用于驱动动画、脚本和物理。
- 通过 `engine.time` 获取。

## 简述
- `deltaTime`：上一帧到当前帧的时间（受 `timeScale` 与 `maximumDeltaTime` 影响），脚本更新默认使用它。
- `actualDeltaTime`：真实帧间隔，不受缩放/夹制；`elapsedTime`/`actualElapsedTime` 记录累计运行时长。
- `timeScale` 用于整体加速/慢放/暂停（设置 0 即暂停逻辑时间）；`maximumDeltaTime` 防止掉帧导致步长过大。
- 提供 `frameCount` 统计帧数；内部同步时间数据到 Shader，供特效使用。

## 关联
- 获取：`engine.time`
- 关键字段：`deltaTime`、`actualDeltaTime`、`elapsedTime`、`actualElapsedTime`、`frameCount`
- 控制：`timeScale`、`maximumDeltaTime`
- 生命周期：传入 `Script.onUpdate/onLateUpdate` 的 `deltaTime` 即 `engine.time.deltaTime`

## 怎么用
1) 在更新逻辑中使用 `deltaTime` 做与帧率无关的移动/计时。
2) 通过 `timeScale` 做全局暂停或慢动作；必要时调整 `maximumDeltaTime` 避免大跳步。
3) 使用 `elapsedTime`/`frameCount` 做调试或定时触发。

## Best Practices
- 所有增量计算（位移、动画、倒计时）使用 `deltaTime`，避免依赖固定帧率。
- 需要不受 `timeScale` 影响的计时（如网络超时、性能统计）使用 `actualDeltaTime/actualElapsedTime`。
- 设置 `timeScale=0` 仅暂停逻辑时间，若需完全停帧可调用 `engine.pause()`。
- 在后台恢复或重负载设备上适当减小 `maximumDeltaTime`，避免出现过大的物理/移动步长。

## Few-shot（常见需求提示）
- “游戏暂停” → `engine.time.timeScale = 0`，或直接 `engine.pause()`。
- “慢动作击杀” → 临时把 `timeScale` 设置为 `0.2`，结束后恢复 `1`。
- “定时 3 秒后触发” → 累加 `deltaTime` 直到达到阈值。
- “忽略暂停的计时器” → 使用 `actualDeltaTime` 自行累加。

## Notes / Warning
- `timeScale` 为全局生效，会影响所有基于 `deltaTime` 的系统（动画、物理步长等）。
- `deltaTime` 已经过 `maximumDeltaTime` 夹制，长时间挂起后第一次返回仍有限制；如需真实间隔使用 `actualDeltaTime`。
- 修改时间参数不会自动同步已有定时器，需在逻辑中自行考虑缩放。
