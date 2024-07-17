---
order: 3
title: 生命周期尺寸模块
type: 图形
group: 粒子
label: Graphics/Particle
---

[`SizeOverLifetimeModule`](${api}core/SizeOverLifetimeModule) 是 `ParticleGeneratorModule` 的子类，用于处理粒子系统的生命周期内的大小变化。

<img src="https://mdn.alipayobjects.com/huamei_qbugvr/afts/img/A*e0FeQqj-HvAAAAAAAAAAAAAADtKFAQ/original" alt="avatar" style="zoom:50%;" />

## 属性

| 属性                                                           | 释义                                                                                                |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| [separateAxes](${api}core/SizeOverLifetimeModule#separateAxes) | 布尔值，指定每个轴的大小是否独立变化                                                                |
| [sizeX](${api}core/SizeOverLifetimeModule#sizeX)               | [ParticleCompositeCurve](${api}core/ParticleCompositeCurve) 对象，表示 x 轴方向上粒子的大小变化曲线 |
| [sizeY](${api}core/SizeOverLifetimeModule#sizeY)               | [ParticleCompositeCurve](${api}core/ParticleCompositeCurve) 对象，表示 y 轴方向上粒子的大小变化曲线 |
| [sizeZ](${api}core/SizeOverLifetimeModule#sizeZ)               | [ParticleCompositeCurve](${api}core/ParticleCompositeCurve) 对象，表示 z 轴方向上粒子的大小变化曲线 |
| [size](${api}core/SizeOverLifetimeModule#size)                 | [ParticleCompositeCurve](${api}core/ParticleCompositeCurve) 对象，获取或设置粒子的大小变化曲线      |

## 折线编辑

针对[ ParticleCompositeCurve](${api}core/ParticleCompositeCurve) 对象，在编辑器内置了折线编辑器，可视化调整曲线。

<img src="https://mdn.alipayobjects.com/huamei_qbugvr/afts/img/A*70KGQpOg85oAAAAAAAAAAAAADtKFAQ/original" alt="avatar" style="zoom:50%;" />

或者在代码中：

```ts
sizeOverLifetime.enabled = true;
sizeOverLifetime.size.mode = ParticleCurveMode.Curve;

const curve = sizeOverLifetime.size.curve;
const keys = curve.keys;
keys[0].value = 0.153;
keys[1].value = 1.0;
curve.addKey(0.057, 0.37);
curve.addKey(0.728, 0.958);
```
