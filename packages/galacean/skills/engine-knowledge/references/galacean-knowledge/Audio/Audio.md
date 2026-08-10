# Galacean Audio

## 它是什么
- 引擎的音频系统，支持背景音乐与 2D 音效播放，提供音频资产管理与组件控制。
- 可在场景中为实体添加音频组件，实现播放、循环、音量/静音、播放速率等控制。

## 简述
- 资产：上传常见音频格式生成 `AudioClip`，通过资源管理器加载。
- 组件：`AudioSource`（绑定到实体，播放指定 `AudioClip`）。
- 控制：`play/pause/stop`，`volume`、`loop`、`playbackRate`、`mute`、`playOnEnabled`、`time` 等。
- 支持多实例播放同一 Clip，引用计数由资源管理器管理。

## 关联
- 资产：`AudioClip`
- 组件：`AudioSource`
- 管理：`AudioManager`（内部管理 AudioContext 与全局输出）
- 空间：当前运行时音频为 2D 播放，不支持 3D 空间衰减与方位

## 怎么用
1) 加载或在编辑器上传音频资产。
2) 在目标实体添加 `AudioSource`，设置 `clip` 与播放参数。
3) 调用 `play()` 播放；可在脚本中调整音量/循环等。

## Best Practices
- 对频繁播放的音效复用同一 `AudioClip`，降低加载与内存开销。
- 首次播放尽量在用户交互后触发，避免 AudioContext 未运行导致播放失败。
- 不再需要的音频从 `AudioSource` 移除引用，定期 `resourceManager.gc()` 释放。

## Few-shot（常见需求提示）
- “循环背景音乐” → `source.loop = true; source.play();`
- “调整播放速率” → `source.playbackRate = 0.9;`
- “暂停/恢复” → `source.pause(); source.play();`

## Notes / Warning
- 浏览器策略可能要求用户交互后才能播放音频；注意处理用户手势触发。
- 若 `AudioContext` 未运行，`play()` 会被忽略，需要在交互后再次触发。
- 音频文件大小影响加载时间，建议压缩与合适比特率。
