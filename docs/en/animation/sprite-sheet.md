---
order: 7
title: Frame Animation
type: Animation
label: Animation
---

Galacean supports reference-type animation curves. You can add keyframes of asset types such as (sprites). The following image shows the process of creating sprite animations:

1. Add the `SpriteRenderer` component to the node

![alt text](https://mdn.alipayobjects.com/huamei_3zduhr/afts/img/A*XiUaQ76M4Q0AAAAAAAAAAAAADsJ_AQ/original)

2. Add `Sprite`, you can refer to [Sprite](/en/docs/graphics/2D/sprite)
   
![alt text](https://mdn.alipayobjects.com/huamei_3zduhr/afts/img/A*ababSZAMpJMAAAAAAAAAAAAADsJ_AQ/original)
  
3. Create [Animation Clip](/en/docs/animation/clip) in the **[Assets Panel](/en/docs/assets/interface)**
   
![alt text](https://mdn.alipayobjects.com/huamei_3zduhr/afts/img/A*CZQjSqZAHGsAAAAAAAAAAAAADsJ_AQ/original)


4. Enable recording mode, click on the corresponding frame number in the editor, and add `Sprite` in `SpriteRenderer` to automatically add keyframes

![alt text](https://mdn.alipayobjects.com/huamei_3zduhr/afts/img/A*Eff6TbgYps8AAAAAAAAAAAAADsJ_AQ/original)


### Script Implementation

The engine supports reference-type animation curves ([AnimationRefCurve](/en/apis/core/#AnimationRefCurve)) in version 1.1. The value of the keyframe can be assets such as (sprites, materials). You can create reference-type animation curves to achieve capabilities such as frame animation:

<playground src="animation-sprite.ts"></playground>
