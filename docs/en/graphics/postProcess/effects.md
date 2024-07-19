---
order: 1
title: Post Process Overview
type: Graphics
group: Post Process
label: Graphics/PostProcess
---

## Bloom

<img src="https://gw.alipayobjects.com/zos/OasisHub/99928a81-72c2-45f3-90ba-b51117e01715/image-20240719122439611.png" alt="image-20240719122439611" style="zoom:50%;" />

| Property | Description |
| :-- | :-- |
| Down Scale | Controls the starting resolution of bloom post-processing. You can choose `Half` or `Quarter`. <img src="https://gw.alipayobjects.com/zos/OasisHub/7ef59bce-545c-46fd-b8bd-ed1d2d53a806/image-20240719124827207.png" alt="image-20240719124827207" style="zoom:50%;" /> |
| Threshold | Filters out pixels under this level of brightness. Value is in gamma-space. <img src="https://gw.alipayobjects.com/zos/OasisHub/efd5bba3-2431-4f02-8da4-eabaf0bc7442/image-20240719125046515.png" alt="image-20240719125046515" style="zoom:50%;" /> |
| Scatter | Set the radius of the bloom effect. <img src="https://gw.alipayobjects.com/zos/OasisHub/5d7a1db1-6298-4724-a567-6c359857971b/image-20240719125314436.png" alt="image-20240719125314436" style="zoom:50%;" /> |
| Intensity | Strength of the bloom effect. <img src="https://gw.alipayobjects.com/zos/OasisHub/85f8881f-71a6-4668-b46d-9b6299511732/image-20240719125438923.png" alt="image-20240719125438923" style="zoom:50%;" /> |
| Tint | The tint of the bloom effect. <img src="https://gw.alipayobjects.com/zos/OasisHub/509b60b3-e60d-45ec-befd-6f1250777e79/image-20240719125641490.png" alt="image-20240719125641490" style="zoom:50%;" /> |
| Dirt Texture | Dirtiness texture to add smudges or dust to the bloom effect. <img src="https://gw.alipayobjects.com/zos/OasisHub/8305a5bd-c6d7-42ac-a74c-8b47991982cd/image-20240719125811736.png" alt="image-20240719125811736" style="zoom:50%;" /> |
| Dirt Intensity | The strength of the dirt texture. <img src="https://gw.alipayobjects.com/zos/OasisHub/4f08c333-f4d5-46fe-9fbc-ac1aa007e269/image-20240719125912636.png" alt="image-20240719125912636" style="zoom:50%;" /> |

## Tonemapping

<img src="https://gw.alipayobjects.com/zos/OasisHub/d326f3fb-0d04-493c-8714-93cd4c5924ae/image-20240719122505552.png" alt="image-20240719122505552" style="zoom:50%;" />

| Property | Description |
| :-- | :-- |
| Mode | Tonemapping algorithm. You can choose between `Neutral` and `ACES`. `Netural` mode is especially suitable for situations where you only want range-remapping with minimal impact on color hue and saturation; `ACES` mode uses the ACES reference color space for feature films, it produces a cinematic, contrasty result, but more performance consuming. <img src="https://gw.alipayobjects.com/zos/OasisHub/f4a86b64-3291-425b-a9e5-e5d2569499e7/image-20240719131111428.png" alt="image-20240719131111428" style="zoom:50%;" /> |
