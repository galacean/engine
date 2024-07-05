---
order: 3
title: Blinn Phong
type: 着色器
group: 网格
label: Graphics/Shader
---

[BlinnPhongMaterial](/apis/core/#BlinnPhongMaterial) 材质是经典的材质之一，虽然不是基于物理渲染，但是其高效的渲染算法和基本齐全的光学部分，流传至今仍可以适用很多的场景。

<playground src="blinn-phong.ts"></playground>

## 编辑器使用

<img src="https://gw.alipayobjects.com/zos/OasisHub/eaa93827-29a4-46ad-b9d3-f179fa200c57/blinn.gif" alt="blinn" style="zoom:100%;" />

## 参数介绍

| 参数                                                              | 应用                                                                                                                       |
| :---------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------- |
| [baseColor](/apis/core/#BlinnPhongMaterial-baseColor)              | 基础颜色。 **基础颜色 \* 基础纹理 = 最后的基础颜色。**                                                                     |
| [baseTexture](/apis/core/#BlinnPhongMaterial-baseTexture)          | 基础纹理。搭配基础颜色使用，是个相乘的关系。                                                                               |
| [specularColor](/apis/core/#BlinnPhongMaterial-specularColor)      | 镜面反射颜色。**镜面反射颜色 \* 镜面反射纹理 = 最后的镜面反射颜色。**                                                      |
| [specularTexture](/apis/core/#BlinnPhongMaterial-specularTexture)  | 镜面反射纹理。搭配镜面反射颜色使用，是个相乘的关系。                                                                       |
| [normalTexture](/apis/core/#BlinnPhongMaterial-normalTexture)      | 法线纹理。可以设置法线纹理 ，在视觉上造成一种凹凸感，还可以通过法线强度来控制凹凸程度。                                    |
| [normalIntensity ](/apis/core/#BlinnPhongMaterial-normalIntensity) | 法线强度。法线强度，用来控制凹凸程度。                                                                                     |
| [emissiveColor](/apis/core/#BlinnPhongMaterial-emissiveColor)      | 自发光颜色。**自发光颜色 \* 自发光纹理 = 最后的自发光颜色。即使没有光照也能渲染出颜色。**                                  |
| [emissiveTexture](/apis/core/#BlinnPhongMaterial-emissiveTexture)  | 自发光纹理。搭配自发光颜色使用，是个相乘的关系。                                                                           |
| [shininess](/apis/core/#BlinnPhongMaterial-shininess)              | 镜面反射系数。值越大镜面反射效果越聚拢。                                                                                   |
| [tilingOffset](/apis/core/#BlinnPhongMaterial-tilingOffset)        | 纹理坐标的缩放与偏移。是一个 Vector4 数据，分别控制纹理坐标在 uv 方向上的缩放和偏移，参考 [案例](${examples}tiling-offset) |

如果需要通过脚本使用材质，可以前往[材质的使用教程](/docs/graphics-material-script)。
