---
order: 0
title: 粒子
type: 图形
group: 粒子
label: Graphics/Particle
---

Galacean Engine 的粒子（粒子渲染器） [ParticleRenderer](${api}core/ParticleRenderer) 是常用的渲染组件，具备丰富的属性，通过调节各个属性值达到绚丽多彩的粒子效果。

![avatar](https://mdn.alipayobjects.com/huamei_qbugvr/afts/img/A*oPEmTqfD_asAAAAAAAAAAAAADtKFAQ/original)

## 组件

粒子组件可以通过层级树面板上方的快捷方式，或检查器面板的添加组件挂载于场景中已激活的 Entity 上。

![avatar](https://mdn.alipayobjects.com/huamei_qbugvr/afts/img/A*fD8iTZUbiI4AAAAAAAAAAAAADtKFAQ/original)

添加完毕后，可以在检查器面板查看粒子属性。视图窗口的左下角的粒子面板可以控制粒子效果的在视图窗口的播放。

![avatar](https://mdn.alipayobjects.com/huamei_qbugvr/afts/img/A*KekfSb89BSIAAAAAAAAAAAAADtKFAQ/original)

您也可以在脚本中挂载粒子组件。

```ts
// 创建实体
const entity = root.createChild("particleEntity");
// 创建粒子组件
let particleRenderer = particleEntity.addComponent(ParticleRenderer);
```

## 渲染材质

[ParticleMaterial](${api}core/ParticleMaterial) 是粒子的默认材质。

编辑器中通过 添加材质 - 选择粒子材质 创建。编辑完成后回到粒子观察器面板中选择该材质进行使用。

<img src="https://mdn.alipayobjects.com/huamei_qbugvr/afts/img/A*l8WoQbbd6lMAAAAAAAAAAAAADtKFAQ/original" alt="avatar" style="zoom:50%;" />

或者在脚本中:

```ts
// 添加粒子材质
const material = new ParticleMaterial(engine);
particleRenderer.setMaterial(material);
```

| 属性                                                 | 释义     |
| ---------------------------------------------------- | -------- |
| [baseColor](${api}core/ParticleMaterial#baseColor)   | 基础颜色 |
| [baseTexture](${api}core/ParticleMaterial#baseColor) | 基础纹理 |

## 播放控制

选中带有粒子组件的实体时出现的粒子面板允许您控制粒子效果在视图窗口的播放。

需要注意的是，在该面板上对粒子播放的调整，仅为视图窗口的预览服务，并不改变该粒子组件的属性。如果需要改变粒子的播放相关属性，需要在观察器面板调整。

<img src="https://mdn.alipayobjects.com/huamei_qbugvr/afts/img/A*3-04T5v0xisAAAAAAAAAAAAADtKFAQ/original" alt="avatar" style="zoom:50%;" />

| 预览播放选项 | 释义                                       |
| ------------ | ------------------------------------------ |
| 重播         | 停止当前的粒子效果播放，并立即从头开始播放 |
| 停止         | 停止粒子效果的播放，并重置回初识状态       |
| 暂停 播放    | 暂停 / 开始播放粒子效果                    |
| 选中 / 全局  | 播放的是当前选中粒子，或者场景中全部粒子   |
| 包围盒       | 当前选中粒子的包围盒                       |

或者在代码中，

```ts
// 播放
particleRenderer.generator.play();
// 停止
particleRenderer.generator.stop();
// 调整播放速度
particleRenderer.generator.main.simulationSpeed = 2;
```

## 粒子生成器

`ParticleRenderer` 的 [generator](${api}core/ParticleGenerator) 属性主要负责粒子的生成和播放功能，生成粒子相关的功能由多个模块组成，分别是主模块、发射器模块、生命周期尺寸模块、生命周期颜色模块、生命周期速度模块、生命周期旋转模块、纹理表格动画模块。在编辑器粒子观察器面板可以直观看到各个模块及分选项。

## 其他参数

<img src="https://mdn.alipayobjects.com/huamei_qbugvr/afts/img/A*MiCESpgK-LwAAAAAAAAAAAAADtKFAQ/original" alt="avatar" style="zoom:50%;" />

| 属性 | 释义 |
| --- | --- |
| [velocityScale](${api}core/ParticleRenderer#velocityScale) | 指定粒子根据其速度伸展的程度 |
| [lengthScale](${api}core/ParticleRenderer#lengthScale) | 定义粒子在其运动方向上伸展的程度，定义为粒子的长度与其宽度的比例 |
| [pivot](${api}core/ParticleRenderer#pivot) | 粒子的枢轴 |
| [renderMode](${api}core/ParticleRenderer#renderMode) | 粒子的渲染模式 |
| [mesh](${api}core/ParticleRenderer#mesh) | 粒子的网格，当 `renderMode` 为 `Mesh` 时有效 |
