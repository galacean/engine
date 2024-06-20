---
order: 5
title: 生命周期速度模块
type: 图形
group: 粒子
label: Graphics/Particle
---

### 生命周期速度模块

[`VelocityOverLifetimeModule`](${api}core/VelocityOverLifetimeModule) 继承自 `ParticleGeneratorModule`，用于控制粒子系统的生命周期内的速度变化。

<img src="https://mdn.alipayobjects.com/huamei_qbugvr/afts/img/A*cJWxR6XQ2VwAAAAAAAAAAAAADtKFAQ/original" alt="avatar" style="zoom:50%;" />

## 属性

| 属性                                                         | 释义                                                                                                |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| [space](${api}core/VelocityOverLifetimeModule#velocityZ)     | 选择速度变化的空间，可以是世界空间或本地空间                                                        |
| [velocityX](${api}core/VelocityOverLifetimeModule#velocityX) | [ParticleCompositeCurve](${api}core/ParticleCompositeCurve) 对象，表示粒子在其生命周期内的 x 轴旋转 |
| [velocityY](${api}core/VelocityOverLifetimeModule#velocityY) | [ParticleCompositeCurve](${api}core/ParticleCompositeCurve) 对象，表示粒子在其生命周期内的 y 轴旋转 |
| [velocityZ](${api}core/VelocityOverLifetimeModule#velocityZ) | [ParticleCompositeCurve](${api}core/ParticleCompositeCurve) 对象，表示粒子在其生命周期内的 z 轴旋转 |
