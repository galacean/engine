---
order: 1
title: Directional Light
type: Graphics
group: Lighting
label: Graphics/Light
---

**Directional Light** represents light that is emitted uniformly from a specific direction, with parallel light rays. The sunlight shining on the Earth's surface can be considered as directional light because the distance between the Sun and the Earth is much greater than the Earth's radius. Therefore, the sunlight shining on the Earth can be seen as a set of parallel light rays coming from the same direction, which is directional light.

<img src="https://gw.alipayobjects.com/zos/OasisHub/a7f8b3f7-1a5f-4a56-8e57-1636a72aa1fb/image-20240319173643671.png" alt="image-20240319173643671" style="zoom:50%;" />

Directional light has 3 main properties: _Color_ ([color](/apis/core/#DirectLight-color)), _Intensity_ ([intensity](/apis/core/#DirectLight-intensity)), and _Direction_ ([direction](/apis/core/#DirectLight-direction)). The _Direction_ is represented by the orientation of the node where the directional light is located.

| Property   | Description                       |
| :-------- | :------------------------------- |
| Intensity | Controls the intensity of the parallel light, **the higher the value, the brighter** |
| Color     | Controls the color of the parallel light, default is white       |
| Culling Mask     | Controls which objects the light needs to illuminate, default is Everything. Needs to be used in conjunction with the Entity's Layer  |



## Script Usage

```typescript
const lightEntity = rootEntity.createChild("light");
const directLight = lightEntity.addComponent(DirectLight);

// 调整颜色
directLight.color.set(0.3, 0.3, 1, 1);

// 调整强度
directLight.intensity = 2;

// 调整方向
lightEntity.transform.setRotation(-45, -45, 0);
```
