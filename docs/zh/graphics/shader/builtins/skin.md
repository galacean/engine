---
order: 8
title: 皮肤着色器
type: 着色器
group: 网格
label: Graphics/Shader
---

皮肤采用Spherical Gaussial模型，可以灵活的自定义不同的Diffusion Profile(扩散剖面)，模拟人类皮肤或者普通的次表面散射效果。

![image-20240726113411961](https://mdn.alipayobjects.com/huamei_9ahbho/afts/img/A*PhRsQ6AwhoMAAAAAAAAAAAAADgDwAQ/original)

## 导入示例

Galacean为你提供了皮肤示例进一步帮助你入门，要查找此示例，请[点击](https://galacean.antgroup.com/editor/projects)。

1. 在Galacean编辑器中导航到编辑器首页。
2. 选择 **Templates** 面板，导航到模板界面，预览并且下载眼球示例到 **Project**。

## 材质属性

|       参数       |           描述           |
| :--------------: | :----------------------: |
|     SSSColor     |     调节皮肤散射颜色     |
| CurvatureTexture | 曲率贴图，控制散射的区域 |
|  CurvaturePower  | 曲率的强度，建议不超过1  |

