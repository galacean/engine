---
order: 1
title: 主模块
type: 图形
group: 粒子
label: Graphics/Particle
---

[MainModule](${api}core/MainModule) 是 `ParticleGeneratorModule` 的主模块，包含了最基本的粒子生成参数。这些属性大多用于控制新创建的粒子的初始状态。

<img src="https://mdn.alipayobjects.com/huamei_qbugvr/afts/img/A*JUjgTLfiz7kAAAAAAAAAAAAADtKFAQ/original" alt="avatar" style="zoom:50%;" />

## 属性

| 属性                                                     | 释义                                                    |
| -------------------------------------------------------- | ------------------------------------------------------- |
| [duration](${api}core/MainModule#duration)               | 粒子生成器的持续时间（单位：秒）                        |
| [isLoop](${api}core/MainModule#isLoop)                   | 指定粒子生成器是否循环                                  |
| [startDelay](${api}core/MainModule#startDelay)           | 粒子发射的开始延迟（单位：秒）                          |
| [startLifetime](${api}core/MainModule#startLifetime)     | 粒子发射时的初始生命周期                                |
| [startSpeed](${api}core/MainModule#startSpeed)           | 粒子生成器首次生成粒子时的初始速度                      |
| [startSize3D](${api}core/MainModule#startSize3D)         | 是否以每个轴的粒子大小分别指定                          |
| [startSize](${api}core/MainModule#startSize)             | 粒子生成器首次生成粒子时的初始大小                      |
| [startSizeX](${api}core/MainModule#startSizeX)           | 粒子生成器首次生成粒子时沿 x 轴的初始大小               |
| [startSizeY](${api}core/MainModule#startSizeY)           | 粒子生成器首次生成粒子时沿 y 轴的初始大小               |
| [startSizeZ](${api}core/MainModule#startSizeZ)           | 粒子生成器首次生成粒子时沿 z 轴的初始大小               |
| [startRotation3D](${api}core/MainModule#startRotation3D) | 是否启用 3D 粒子旋转                                    |
| [startRotation](${api}core/MainModule#startRotation)     | 粒子生成器首次生成粒子时的初始旋转                      |
| [startRotationX](${api}core/MainModule#startRotationX)   | 粒子发射时沿 x 轴的初始旋转                             |
| [startRotationY](${api}core/MainModule#startRotationY)   | 粒子发射时沿 y 轴的初始旋转                             |
| [startRotationZ](${api}core/MainModule#startRotationZ)   | 粒子发射时沿 z 轴的初始旋转                             |
| [flipRotation](${api}core/MainModule#flipRotation)       | 使部分粒子以相反方向旋转                                |
| [startColor](${api}core/MainModule#startColor)           | 粒子的初始颜色模式                                      |
| [gravityModifier](${api}core/MainModule#gravityModifier) | 此粒子生成器应用于由 Physics.gravity 定义的重力的比例   |
| [simulationSpace](${api}core/MainModule#simulationSpace) | 选择模拟粒子的空间，它可以是世界空间或本地空间          |
| [simulationSpeed](${api}core/MainModule#simulationSpeed) | 覆盖粒子生成器的默认播放速度                            |
| [scalingMode](${api}core/MainModule#scalingMode)         | 控制粒子生成器如何将其 Transform 组件应用到它发射的粒子 |
| [playOnEnabled](${api}core/MainModule#playOnEnabled)     | 如果设置为 true，粒子生成器将在启动时自动开始播放       |
| [maxParticles](${api}core/MainModule#maxParticles)       | 最大粒子数                                              |
