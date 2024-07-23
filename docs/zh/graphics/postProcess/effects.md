---
order: 1
title: 后处理效果
type: 图形
group: 后处理
label: Graphics/PostProcess
---

## 泛光（Bloom）

<img src="https://gw.alipayobjects.com/zos/OasisHub/99928a81-72c2-45f3-90ba-b51117e01715/image-20240719122439611.png" style="zoom:50%;" />

- **Down Scale**： 控制泛光后处理的起始分辨率, 可以选择 `Half`， `Quarter`。

<figure>
  <img src="https://gw.alipayobjects.com/zos/OasisHub/32712777-1bb3-42f9-b17b-d4eecf9eea19/image-20240723172204618.png" style="zoom:50%;" />
  <figcaption style="text-align:center; color: #889096;font-size:14px">`Half`(left), `Quarter`(right)</figcaption>
</figure>

- **Threshold**：泛光效果会过滤掉低于此亮度级别的像素，该值位于伽马空间。

<figure>
  <img src="https://gw.alipayobjects.com/zos/OasisHub/739acae8-991f-4b9a-af76-7f6c695156ca/image-20240723180139089.png" style="zoom:50%;" />
  <figcaption style="text-align:center; color: #889096;font-size:14px">value `0.9`(left), `0.5`(right)</figcaption>
</figure>

- **Scatter**：设置泛光效果的扩散范围。

<figure>
  <img src="https://gw.alipayobjects.com/zos/OasisHub/a8cd9144-7182-4ee9-a6a4-aef279fb3799/image-20240723180228646.png" style="zoom:50%;" />
  <figcaption style="text-align:center; color: #889096;font-size:14px">value `0.3`(left), `0.8`(right)</figcaption>
</figure>

- **Intensity**：泛光效果的强度。

<figure>
  <img src="https://gw.alipayobjects.com/zos/OasisHub/1aaa6eaa-0841-4427-b1ea-afb7c74308d4/image-20240723180255363.png" style="zoom:50%;" />
  <figcaption style="text-align:center; color: #889096;font-size:14px">value `1`(left), `2`(right)</figcaption>
</figure>

- **Tint**：泛光效果的色调。

<figure>
  <img src="https://gw.alipayobjects.com/zos/OasisHub/95c85eea-7cae-4c0b-9049-568d6da0259b/image-20240723180322584.png" style="zoom:50%;" />
  <figcaption style="text-align:center; color: #889096;font-size:14px">value `(255, 255, 255)`(left), `(255, 0, 0)`(right)</figcaption>
</figure>

- **Dirt Texture**：使用污渍纹理可为泛光效果添加污迹或灰尘。

<figure>
  <img src="https://gw.alipayobjects.com/zos/OasisHub/280ada8b-d007-4f4a-908f-62773d625c5a/image-20240723180356801.png" style="zoom:50%;" />
  <figcaption style="text-align:center; color: #889096;font-size:14px">`OFF`(left), `ON`(right)</figcaption>
</figure>

- **Dirt Intensity**：污渍纹理的强度。

<figure>
  <img src="https://gw.alipayobjects.com/zos/OasisHub/85e9b9b7-3752-4fec-bbee-82fc96e76977/image-20240723180441902.png" style="zoom:50%;" />
  <figcaption style="text-align:center; color: #889096;font-size:14px">value `1`(left), `5`(right)</figcaption>
</figure>

## 色调映射（Tonemapping）

<img src="https://gw.alipayobjects.com/zos/OasisHub/d326f3fb-0d04-493c-8714-93cd4c5924ae/image-20240719122505552.png" style="zoom:50%;" />

- **Mode**：色调映射算法。可以选择 `Neutral` 和 `ACES`。 `Netural` 模式特别适用于只需要范围重映射且对色调和饱和度影响最小的情况；`ACES` 模式使用电影的 ACES 参考色彩空间，可产生电影般的对比度效果，但性能消耗较大。

<figure>
  <img src="https://gw.alipayobjects.com/zos/OasisHub/83184ba2-9913-46d6-821d-e8ac6afec542/image-20240723180530944.png" style="zoom:50%;" />
  <figcaption style="text-align:center; color: #889096;font-size:14px">`OFF`(left), `Netual`(center), `ACES`(right)</figcaption>
</figure>
