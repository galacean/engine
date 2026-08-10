# Galacean Particle

## 它是什么
- 粒子系统组件 `ParticleRenderer`，用于特效/烟雾/火焰/光效等。基于模块化配置（Main、Emission、Velocity/Force/Color/Size/Rotation over Lifetime 等）。
- 支持多种渲染模式（Billboard/Stretch Billboard/Mesh）、世界/本地模拟空间、循环与触发控制。

## 简述
- 入口：`ParticleRenderer.generator`，包含各模块参数；启停通过 `generator.play/stop/pause`，`main.playOnEnabled` 控制启用即播放。
- 主要模块（典型字段）：
  - `main`: `duration`、`looping`、`startLifetime`、`startSpeed`、`startSize`、`startColor`、`maxParticles`、`simulationSpace`、`playOnEnabled`
  - `emission`: `rateOverTime`、`bursts`
  - `velocityOverLifetime`、`forceOverLifetime`、`rotationOverLifetime`、`sizeOverLifetime`、`colorOverLifetime`
  - `textureSheetAnimation`（UV 序列帧）等
- 渲染：`renderMode`（Billboard/StretchBillboard/Mesh），可选 `mesh`、`pivot`、`lengthScale/velocityScale`；使用粒子材质。
- 阴影：默认不投射/接收，必要时按渲染器属性启用。

## 关联
- 组件：`ParticleRenderer`（子类自带 `generator`）
- 渲染模式：`ParticleRenderMode`（Billboard/StretchBillboard/Mesh）
- 模拟空间：`ParticleSimulationSpace`（Local/World）
- 停止模式：`ParticleStopMode`

## 怎么用
1) 在实体上添加 `ParticleRenderer`，配置 `generator.main` 与其他模块。
2) 选择渲染模式与材质（默认粒子材质）；需要网格粒子时设置 `renderMode = Mesh` + `mesh`。
3) 控制播放：`generator.play()` / `pause()` / `stop(clear)`；可设置 `playOnEnabled` 在启用时自动播放。

## Best Practices
- 移动端优先使用 Billboard/Stretch 模式并限制 `maxParticles`，避免 Mesh 粒子过多。
- 开启/关闭模块要设置 `enabled`，未启用的模块不会生效。
- 合理控制发射率、生命周期与粒子数，避免瞬间高峰导致掉帧；使用 `burst` 做瞬时效果。
- 使用 Texture Sheet Animation 合并序列帧贴图，减少材质切换；注意 UV 尺寸与循环。
- 世界空间模拟用于跟随场景效果，本地空间用于随节点整体移动/缩放的特效。

## Few-shot（常见需求提示）
- “播放一次后销毁” → `generator.play(false);` 在 `stop` 回调或延时销毁实体。
- “拖尾效果” → 使用 Stretch Billboard，调整 `lengthScale/velocityScale`。
- “烟雾随风偏移” → 开启 `forceOverLifetime` 设置方向力，或 `velocityOverLifetime`。
- “序列帧火焰” → 启用 `textureSheetAnimation` 设置行列与循环。

## Notes / Warning
- 当前部分渲染模式（Horizontal/Vertical Billboard、Mesh）可能未完全实现或需特定材质支持，确认版本能力。
- 粒子数量与材质透明渲染会显著增加 fillrate；注意透明排序与后处理开销。
- 动态修改网格/材质需考虑共享资源引用计数，避免误删。
