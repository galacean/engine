---
order: 3
title: Spotlight
type: Graphics
group: Lighting
label: Graphics/Light
---

**Spotlight** is like the light emitted from a flashlight in real life, emitting conically from a point in a specific direction.

<img src="https://gw.alipayobjects.com/zos/OasisHub/93b85357-e67b-4c80-b74e-f116250958a7/image-20240319174652884.png" alt="image-20240319174652884" style="zoom:50%;" />

The spotlight has several main characteristics: _color_ ([color](/en/apis/core/#SpotLight-color)), _intensity_ ([intensity](/en/apis/core/#SpotLight-intensity)), _effective distance_ ([distance](/en/apis/core/#SpotLight-distance)), _scatter angle_ ([angle](/en/apis/core/#SpotLight-angle)), _penumbra attenuation angle_ ([penumbra](/en/apis/core/#SpotLight-penumbra)). The scatter angle indicates the angle within which there is light relative to the direction of the light source, and the penumbra attenuation angle indicates that within the effective angle range, the light intensity gradually attenuates to 0 as the angle increases.

| Attribute              | Function                                                                 |
| :--------------------- | :------------------------------------------------------------------------ |
| Angle (Scatter Angle)  | Indicates the angle within which there is light relative to the direction of the light source |
| Intensity              | Controls the intensity of the spotlight, **the higher the value, the brighter** |
| Color                  | Controls the color of the spotlight                                       |
| Distance               | Effective distance, light intensity attenuates with distance              |
| Penumbra (Attenuation Angle) | Indicates that within the effective angle range, the light intensity gradually attenuates to 0 as the angle increases |
| Culling Mask           | Controls the objects that need to be illuminated by the light, default is Everything. Needs to be used in conjunction with the Entity's Layer |

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
