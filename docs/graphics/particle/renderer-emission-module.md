---
order: 2
title: 发射器模块
type: 图形
group: 粒子
label: Graphics/Particle
---

[EmissionModule](${api}core/EmissionModule) 是 `ParticleGeneratorModule` 的发射模块。该模块用于处理粒子系统的发射行为，包括粒子发射速率、发射形状以及爆破（burst）行为等。

<img src="https://mdn.alipayobjects.com/huamei_qbugvr/afts/img/A*G7_zS5_A3pMAAAAAAAAAAAAADtKFAQ/original" alt="avatar" style="zoom:50%;" />

## 属性

| 属性                                                           | 释义                                                                                                            |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| [rateOverTime](${api}core/EmissionModule#rateOverTime)         | 这是一个 [ParticleCompositeCurve](${api}core/ParticleCompositeCurve) 对象，表示粒子的发射速率。默认值为 `10`    |
| [rateOverDistance](${api}core/EmissionModule#rateOverDistance) | 这是一个 [ParticleCompositeCurve](${api}core/ParticleCompositeCurve) 对象，表示粒子的距离发射速率。默认值为 `0` |
| [shape](${api}core/EmissionModule#shape)                       | 这是一个 `BaseShape` 对象，表示发射器的形状                                                                     |

## 方法

| 方法                                                                              | 释义                     |
| --------------------------------------------------------------------------------- | ------------------------ |
| [addBurst(burst: Burst)](${api}core/EmissionModule#addBurst)                      | 添加一个爆破行为         |
| [removeBurst(burst: Burst)](${api}core/EmissionModule#removeBurst)                | 移除一个爆破行为         |
| [removeBurstByIndex(index: number)](${api}core/EmissionModule#removeBurstByIndex) | 通过索引移除一个爆破行为 |
| [clearBurst()](${api}core/EmissionModule#clearBurst)                              | 清除所有的爆破行为       |

## 形状

目前引擎内置了以下发射器形状，选中粒子组件时提供对应形状的辅助显示。

| 发射器形状类型                                               | 释义                                 |
| ------------------------------------------------------------ | ------------------------------------ |
| [BoxShape](${api}core/EmissionModule#BoxShape)               | `BaseShape` 对象，发射器形状为立方体 |
| [CircleShape](${api}core/EmissionModule#CircleShape)         | `BaseShape` 对象，发射器形状为圆圈   |
| [ConeShape](${api}core/EmissionModule#ConeShape)             | `BaseShape` 对象，发射器形状为类圆锥 |
| [HemisphereShape](${api}core/EmissionModule#HemisphereShape) | `BaseShape` 对象，发射器形状为半球   |
| [SphereShape](${api}core/EmissionModule#SphereShape)         | `BaseShape` 对象，发射器形状为球体   |
