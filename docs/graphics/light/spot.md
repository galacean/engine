---
order: 3
title: 聚光灯
type: 图形
group: 光照
label: Graphics/Light
---

**聚光灯**就像现实生活中的手电筒发出的光，从某个点朝特定方向锥形发射。

<img src="https://gw.alipayobjects.com/zos/OasisHub/93b85357-e67b-4c80-b74e-f116250958a7/image-20240319174652884.png" alt="image-20240319174652884" style="zoom:50%;" />

聚光灯有几个主要特性：_颜色_（[color](/apis/core/#SpotLight-color)）、_强度_（[intensity](/apis/core/#SpotLight-intensity)）、_有效距离_（[distance](/apis/core/#SpotLight-distance)）、_散射角度_（[angle](/apis/core/#SpotLight-angle)）、_半影衰减角度_（[penumbra](/apis/core/#SpotLight-penumbra)）。散射角度表示与光源朝向夹角小于多少时有光线，半影衰减角度表示在有效的夹角范围内，随着夹角增大光照强度逐渐衰减至 0 。

| 属性                   | 作用                                                                      |
| :--------------------- | :------------------------------------------------------------------------ |
| Angle(散射角度)        | 表示与光源朝向夹角小于多少时有光线                                        |
| Intensity(强度)        | 控制聚光灯的强度，**值越高越亮**                                          |
| Color(颜色)            | 控制聚光灯的颜色                                                          |
| Distance(距离)         | 有效距离，光照强度随距离衰减                                              |
| Penumbra(半影衰减角度) | 表示在有效的夹角范围内，随着夹角增大光照强度逐渐衰减至 0                  |
| Culling Mask           | 控制灯光需要照亮的物体，默认 Everything。 需要配合 Entity 的 Layer 来使用 |

### 脚本使用

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
