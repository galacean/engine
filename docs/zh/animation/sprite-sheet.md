---
order: 7
title: 帧动画
type: 动画
label: Animation
---

Galacean 支持引用类型的动画曲线，你可以添加类型为资产的关键帧比如（精灵）下图为制作精灵动画的流程：

1. 给节点添加 `SpriteRenderer` 组件

![alt text](https://mdn.alipayobjects.com/huamei_3zduhr/afts/img/A*XiUaQ76M4Q0AAAAAAAAAAAAADsJ_AQ/original)

2. 添加`精灵`，可以参考[精灵](/docs/graphics-2d-sprite)
   
![alt text](https://mdn.alipayobjects.com/huamei_3zduhr/afts/img/A*ababSZAMpJMAAAAAAAAAAAAADsJ_AQ/original)
  
3. 在 **[资产面板](/docs/assets-interface)** 中创建 [动画片段](/docs/animation-clip)
   
![alt text](https://mdn.alipayobjects.com/huamei_3zduhr/afts/img/A*CZQjSqZAHGsAAAAAAAAAAAAADsJ_AQ/original)


4. 开启录制模式，编辑器中点到对应的帧数，在 `SpriteRenderer` 中添加 `Sprite` 即可自动添加关键帧

![alt text](https://mdn.alipayobjects.com/huamei_3zduhr/afts/img/A*Eff6TbgYps8AAAAAAAAAAAAADsJ_AQ/original)


### 脚本实现

引擎在 1.1 版本支持引用类型的动画曲线（[AnimationRefCurve](/apis/core/#AnimationRefCurve)），关键帧的值可以是资产如（精灵，材质），你可以通过创建引用类型的动画曲线实现比如帧动画的能力：

<playground src="animation-sprite.ts"></playground>
