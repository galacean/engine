---
order: 6
title: 纹理表格动画模块
type: 图形
group: 粒子
label: Graphics/Particle
---

[`TextureSheetAnimationModule`](${api}core/TextureSheetAnimationModule) 继承自 `ParticleGeneratorModule`，用于控制粒子系统的纹理表动画。

<img src="https://mdn.alipayobjects.com/huamei_qbugvr/afts/img/A*XhXmQadW8ToAAAAAAAAAAAAADtKFAQ/original" alt="avatar" style="zoom:50%;" />

## 属性

| 属性                                                                  | 释义                                                                                             |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| [startFrame](${api}core/TextureSheetAnimationModule#startFrame)       | [ParticleCompositeCurve](${api}core/ParticleCompositeCurve) 对象，表示纹理表的起始帧             |
| [frameOverTime](${api}core/TextureSheetAnimationModule#frameOverTime) | [ParticleCompositeCurve](${api}core/ParticleCompositeCurve) 对象，表示纹理表的帧随时间变化的曲线 |
| [type](${api}core/TextureSheetAnimationModule#type)                   | `TextureSheetAnimationType` 枚举，表示纹理表动画的类型                                           |
| [cycleCount](${api}core/TextureSheetAnimationModule#cycleCount)       | `number` 类型，表示纹理表动画的周期计数                                                          |
| [tiling](${api}core/TextureSheetAnimationModule#tiling)               | `Vector2` 对象，表示纹理表的平铺。可以通过 `get` 和 `set` 方法访问和修改                         |
