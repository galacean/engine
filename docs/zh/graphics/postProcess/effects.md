---
order: 1
title: 后处理效果
type: 图形
group: 后处理
label: Graphics/PostProcess
---

## 泛光（Bloom）

<img src="https://gw.alipayobjects.com/zos/OasisHub/99928a81-72c2-45f3-90ba-b51117e01715/image-20240719122439611.png" alt="image-20240719122439611" style="zoom:50%;" />

| 属性 | 描述 |
| :-- | :-- |
| Down Scale | 控制泛光后处理的起始分辨率, 可以选择 1/2， 1/4。 <img src="https://gw.alipayobjects.com/zos/OasisHub/7ef59bce-545c-46fd-b8bd-ed1d2d53a806/image-20240719124827207.png" alt="image-20240719124827207" style="zoom:50%;" /> |
| Threshold | 泛光效果会过滤掉低于此亮度级别的像素，该值位于伽马空间。 <img src="https://gw.alipayobjects.com/zos/OasisHub/efd5bba3-2431-4f02-8da4-eabaf0bc7442/image-20240719125046515.png" alt="image-20240719125046515" style="zoom:50%;" /> |
| Scatter | 设置泛光效果的扩散范围。 <img src="https://gw.alipayobjects.com/zos/OasisHub/5d7a1db1-6298-4724-a567-6c359857971b/image-20240719125314436.png" alt="image-20240719125314436" style="zoom:50%;" /> |
| Intensity | 泛光效果的强度。 <img src="https://gw.alipayobjects.com/zos/OasisHub/85f8881f-71a6-4668-b46d-9b6299511732/image-20240719125438923.png" alt="image-20240719125438923" style="zoom:50%;" /> |
| Tint | 泛光效果的色调。 <img src="https://gw.alipayobjects.com/zos/OasisHub/509b60b3-e60d-45ec-befd-6f1250777e79/image-20240719125641490.png" alt="image-20240719125641490" style="zoom:50%;" /> |
| Dirt Texture | 使用污渍纹理可为泛光效果添加污迹或灰尘。 <img src="https://gw.alipayobjects.com/zos/OasisHub/8305a5bd-c6d7-42ac-a74c-8b47991982cd/image-20240719125811736.png" alt="image-20240719125811736" style="zoom:50%;" /> |
| Dirt Intensity | 污渍纹理的强度。 <img src="https://gw.alipayobjects.com/zos/OasisHub/4f08c333-f4d5-46fe-9fbc-ac1aa007e269/image-20240719125912636.png" alt="image-20240719125912636" style="zoom:50%;" /> |

## 色调映射（Tonemapping）

<img src="https://gw.alipayobjects.com/zos/OasisHub/d326f3fb-0d04-493c-8714-93cd4c5924ae/image-20240719122505552.png" alt="image-20240719122505552" style="zoom:50%;" />

| 属性 | 描述 |
| :-- | :-- |
| Mode | 色调映射算法。可以选择 `Neutral` 和 `ACES`。 `Netural` 模式特别适用于只需要范围重映射且对色调和饱和度影响最小的情况；`ACES` 模式使用电影的 ACES 参考色彩空间，可产生电影般的对比度效果，但性能消耗较大。 <img src="https://gw.alipayobjects.com/zos/OasisHub/f4a86b64-3291-425b-a9e5-e5d2569499e7/image-20240719131111428.png" alt="image-20240719131111428" style="zoom:50%;" /> |
