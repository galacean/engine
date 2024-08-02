---
order: 4
title: 生命周期旋转模块
type: 图形
group: 粒子
label: Graphics/Particle
---

[`RotationOverLifetimeModule`](/apis/core/RotationOverLifetimeModule) 继承自 `ParticleGeneratorModule`，用于控制粒子系统的生命周期内的旋转变化。

<img src="https://mdn.alipayobjects.com/huamei_qbugvr/afts/img/A*mEUfRa3o7V8AAAAAAAAAAAAADtKFAQ/original" alt="avatar" style="zoom:50%;" />

## 属性

| 属性                                                               | 释义                                                                                                |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| [separateAxes](/apis/core/RotationOverLifetimeModule#separateAxes) | `boolean` 类型，表示是否在每个轴上分别进行旋转。如果禁用，将只使用 z 轴                             |
| [rotationX](/apis/core/RotationOverLifetimeModule#rotationX)       | [ParticleCompositeCurve](/apis/core/ParticleCompositeCurve) 对象，表示粒子在其生命周期内的 x 轴旋转 |
| [rotationY](/apis/core/RotationOverLifetimeModule#rotationY)       | [ParticleCompositeCurve](/apis/core/ParticleCompositeCurve) 对象，表示粒子在其生命周期内的 y 轴旋转 |
| [rotationZ](/apis/core/RotationOverLifetimeModule#rotationZ)       | [ParticleCompositeCurve](/apis/core/ParticleCompositeCurve) 对象，表示粒子在其生命周期内的 z 轴旋转 |
