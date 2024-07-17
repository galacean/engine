---
order: 4
title: Frame Animation
type: Animation
label: Animation
---

Galacean supports referencing type animation curves, you can add keyframes of type assets such as (sprites). The following is the process of creating sprite animations:

1. Add the `SpriteRenderer` component to the node

![alt text](https://mdn.alipayobjects.com/huamei_3zduhr/afts/img/A*XiUaQ76M4Q0AAAAAAAAAAAAADsJ_AQ/original)

2. Add a `sprite`, you can refer to [Sprite](/en/docs/graphics-2d-sprite)
   
![alt text](https://mdn.alipayobjects.com/huamei_3zduhr/afts/img/A*ababSZAMpJMAAAAAAAAAAAAADsJ_AQ/original)
  
3. Create an [animation clip](/en/docs/animation-clip) in the **[Asset Panel](/en/docs/assets-interface)**
   
![alt text](https://mdn.alipayobjects.com/huamei_3zduhr/afts/img/A*CZQjSqZAHGsAAAAAAAAAAAAADsJ_AQ/original)


4. Enable recording mode, click on the corresponding frame in the editor, and add a `Sprite` in the `SpriteRenderer` to automatically add keyframes

![alt text](https://mdn.alipayobjects.com/huamei_3zduhr/afts/img/A*Eff6TbgYps8AAAAAAAAAAAAADsJ_AQ/original)


### Script Implementation

Starting from version 1.1, the engine supports referencing type animation curves ([AnimationRefCurve](/apis/core/#AnimationRefCurve)), where the values of keyframes can be assets such as (sprites, materials). You can create reference type animation curves to achieve capabilities like frame animation:

<playground src="animation-sprite.ts"></playground>
