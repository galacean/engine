---
order: 3
title: 精灵遮罩
type: 图形
group: 2D
label: Graphics/2D
---

精灵遮罩组件用于对 3D/2D 场景中的[精灵渲染器](/docs/graphics/2D/spriteRenderer/)和[文字渲染器](/docs/graphics/2D/text/)实现遮罩效果。

<playground src="sprite-mask.ts"></playground>

通过 [SpriteMask](/apis/core/#SpriteMask) 提供的参数来控制和 [精灵](/docs/graphics/2D/sprite/) 发生作用。

| 参数            | 类型   | 说明                                                                                             |
| :-------------- | :----- | :----------------------------------------------------------------------------------------------- |
| influenceLayers | number | 当前 mask 影响的遮罩层，默认值为 SpriteMaskLayer.Everything，表示对所有遮罩层都有影响            |
| alphaCutoff     | number | 当前 mask 有效 alpha 值的下限(范围：0~1)，即 sprite 的纹理中 alpha 值小于 alphaCutoff 的将被丢弃 |

[SpriteMaskLayer](/apis/core/#SpriteMaskLayer) 里面声明了引擎提供的遮罩层，一共声明了 32 个遮罩层，分别是 Layer0~Layer31，遮罩层和渲染无关，只是为了帮助开发者设置 `SpriteMask` 和 `SpriteRenderer` 如何进行关联，一个 `SpriteMask` 对象要对一个 `SpriteRenderer` 对象产生遮罩作用的一个前提就是两者的遮罩层有交集。

`SpriteMask` 的 `influenceLayers` 表示该 mask 对处于哪些遮罩层内的 `SpriteRenderer` 会起到遮罩作用，`SpriteRenderer` 的 `maskLayer` 表示该精灵处于哪些遮罩层，如下：

<img src="https://gw.alipayobjects.com/zos/OasisHub/09abdf57-84b8-4aa9-b785-822f858fb4f9/070C8B9F-14E2-4A9A-BFEC-4BC3F2BB564F.png" alt="070C8B9F-14E2-4A9A-BFEC-4BC3F2BB564F" style="zoom: 67%;" />

上图中，spriteMask 对处于 `Layer1` 和 `Layer30` 的精灵有遮罩作用，spriteRenderer0 处于 `Layer2`，不存在交集，所以 spriteRenderer0 不与 spriteMask 起作用，spriteRenderer1 处于 `Layer1`，和 spriteMask 影响的遮罩层有交集，所以 spriteRenderer1 与 spriteMask 起作用。

## 使用

### 添加精灵遮罩组件

当我们需要对一个精灵进行遮罩的时候，首先需要创建一个实体，并添加精灵遮罩组件，如下：

![mask-create](https://mdn.alipayobjects.com/huamei_w6ifet/afts/img/A*GYVBTbTvqU4AAAAAAAAAAAAADjCHAQ/original)

### 设置遮罩区域

精灵遮罩组件通过图片来表示遮罩区域，这里我们通过组件的 `sprite` 参数来设置精灵资源，如下：

![mask-sprite](https://mdn.alipayobjects.com/huamei_w6ifet/afts/img/A*k5GsSYqQTKoAAAAAAAAAAAAADjCHAQ/original)

### 设置精灵的遮罩类型

通过以上两个步骤，会发现遮罩还是没有任何效果，这是因为当前的精灵的遮罩类型还是默认的(None)，我们设置场景中精灵的 `mask interaction` 为内遮罩类型，效果如下：

![mask-interaction](https://mdn.alipayobjects.com/huamei_w6ifet/afts/img/A*GdxhSYLY4EIAAAAAAAAAAAAADjCHAQ/original)

### 设置 alpha cutoff

这个参数表示当前 mask 有效 `alpha` 值的下限(范围：`0~1`)，即 sprite 的纹理中 alpha 值小于 alpha cutoff 的将被丢弃(也就是不会当作遮罩区域)。我们可以通过动态调整这个属性的值来看下实际效果，如下：

![mask-alpha](https://mdn.alipayobjects.com/huamei_w6ifet/afts/img/A*2CLjT7UTVa8AAAAAAAAAAAAADjCHAQ/original)

同样的，在脚本中我们可以用如下代码使用精灵遮罩：

```typescript
// 创建一个遮罩实体
const spriteEntity = rootEntity.createChild(`spriteMask`);
// 给实体添加 SpriteMask 组件
const spriteMask = spriteEntity.addComponent(SpriteMask);
// 通过 texture 创建 sprite 对象
const sprite = new Sprite(engine, texture);
// 设置 sprite
spriteMask.sprite = sprite;
// mask 的 sprite 中纹理 alpha 小于 0.5 的将被丢弃
spriteMask.alphaCutoff = 0.5;
// mask 对所有遮罩层的精灵都生效
spriteMask.influenceLayers = SpriteMaskLayer.Everything;
// mask 只对处于遮罩层 Layer0 的精灵有效
spriteMask.influenceLayers = SpriteMaskLayer.Layer0;
// mask 对处于遮罩层 Layer0 和 Layer1 的精灵有效
spriteMask.influenceLayers = SpriteMaskLayer.Layer0 | SpriteMaskLayer.Layer1;

// 设置遮罩类型
spriteRenderer.maskInteraction = SpriteMaskInteraction.VisibleInsideMask;
// 设置精灵处于哪个遮罩层
spriteRenderer.maskLayer = SpriteMaskLayer.Layer0;
```
