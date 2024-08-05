---
order: 3
title: Spotlight
type: Graphics
group: Lighting
label: Graphics/Light
---

A **spotlight** is like a flashlight in real life, emitting light in a cone from a specific point in a particular direction.

<img src="https://gw.alipayobjects.com/zos/OasisHub/93b85357-e67b-4c80-b74e-f116250958a7/image-20240319174652884.png" alt="image-20240319174652884" style="zoom:50%;" />

Spotlights have several main characteristics: _color_ ([color](/apis/core/#SpotLight-color)), _intensity_ ([intensity](/apis/core/#SpotLight-intensity)), _effective distance_ ([distance](/apis/core/#SpotLight-distance)), _spread angle_ ([angle](/apis/core/#SpotLight-angle)), and _penumbra angle_ ([penumbra](/apis/core/#SpotLight-penumbra)). The spread angle indicates when there is light when the angle between the light source and the direction is less than a certain value, and the penumbra angle indicates that within the effective angle range, the light intensity gradually decays to 0 as the angle increases.

| Property               | Description                                                               |
| :--------------------- | :------------------------------------------------------------------------ |
| Angle                  | Indicates when there is light when the angle between the light source and the direction is less than a certain value |
| Intensity              | Controls the intensity of the spotlight, **the higher the value, the brighter** |
| Color                  | Controls the color of the spotlight                                      |
| Distance               | Effective distance, light intensity decays with distance                  |
| Penumbra               | Indicates that within the effective angle range, the light intensity gradually decays to 0 as the angle increases |
| Culling Mask           | Controls which objects the light needs to illuminate, default is Everything. Needs to be used with Entity's Layer |

### Script Usage

```typescript
const lightEntity = rootEntity.createChild("light");

const spotLight = lightEntity.addComponent(SpotLight);
// 散射角度
spotLight.angle = Math.PI / 6;
// 半影衰减角度，为 0 时没有衰减
spotLight.penumbra = Math.PI / 12;
// 颜色
spotLight.color.set(0.3, 0.3, 1, 1);
// 位置
lightEntity.transform.setPosition(-10, 10, 10);
// 朝向
lightEntity.transform.setRotation(-45, -45, 0);
```
