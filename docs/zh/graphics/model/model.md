---
order: 0
title: 模型总览
type: 图形
group: 模型
label: Graphics/Model
---

模型通常指的是由设计师通过三维建模软件创建的，包含一系列[网格](/docs/graphics/mesh/mesh/)，[材质](/docs/graphics/material/material/)，[纹理](/docs/graphics/texture/texture/)和[动画](/docs/animation/overview/)信息的三维模型，在 Galacean 中，它也被视作一种资产，模型资产工作流通常如下：

```mermaid
	flowchart LR
	建模软件导出模型 --> 导入模型到Galacean编辑器 --> 调整模型
```

本章主要解答如下开发者可能遇到的问题：

- 模型格式的要求，编辑器目前支持导入 `glTF` 或者 `FBX` 格式的模型，但是最后编辑器都会转换成运行时也可以解析的 [glTF](./glTF) 格式。
- [导入模型](./importGlTF)到编辑器
- 什么是[模型资产](./assets)
- [模型的加载与使用](./use)
- [在编辑器中还原美术效果](./restoration)
- [模型优化](./opt)
