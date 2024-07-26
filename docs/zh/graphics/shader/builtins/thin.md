---
order: 9
title: 薄膜干涉着色器
type: 着色器
group: 网格
label: Graphics/Shader
---

虹彩着色器是指某些表面随着视角或照明角度的变化而逐渐改变颜色的现象，是由微结构或薄膜中光波的干涉引起的。虹彩的例子包括肥皂泡、羽毛、蝴蝶翅膀和贝壳珍珠层等矿物。

<img src="https://mdn.alipayobjects.com/huamei_9ahbho/afts/img/A*_GO7QrcLyoYAAAAAAAAAAAAADgDwAQ/original" alt="1721120448550-c36c8ad0-bae5-4bf4-a94b-2ee475a40998" style="zoom:150%;" />

> **注**：对于薄膜干涉材质，颜色取决于光的入射角，能带来很好的颜色渐变，但如果你的模型是low-poly，那么你将无法获得很好的颜色渐变，因为每个面都会以不同的角度反射光线。

## 导入示例

Galacean为你提供了薄膜干涉示例进一步帮助你入门，要查找此示例，请[点击](https://galacean.antgroup.com/editor/projects)。

1. 在Galacean编辑器中导航到编辑器首页。
2. 选择 **Templates** 面板，导航到模板界面，预览并且下载薄膜干涉示例到 **Project**。

## 材质属性

|         参数          |                             描述                             |
| :-------------------: | :----------------------------------------------------------: |
|    iridescent ior     | 该折射率值决定了光线的弯曲程度，对于薄膜干涉而言，它控制着所得光线的颜色。 |
|      iridescence      |      控制虹彩颜色强度，1对应最高强度，0将只有PBR效果。       |
| iridescence Thickness |         用于控制虹彩厚度，决定了最终薄膜干涉的层数。         |

## 技巧

![1721977953387-db703ac3-2fd3-47cb-a8d9-5ddc523a8a9c](https://mdn.alipayobjects.com/huamei_9ahbho/afts/img/A*opDFQY6Cu1EAAAAAAAAAAAAADgDwAQ/original)

ior=1.0
