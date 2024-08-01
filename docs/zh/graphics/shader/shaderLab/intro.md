---
title: ShaderLab
---

> 在[自定义着色器](./custom)章节我们了解到如何使用 WebGL 原生 GLSL 语言创建自定义 Shader，本节我们将介绍另一种创建 Shader 的方式 --- ShaderLab。

`ShaderLab` 是一个针对 Galacean 引擎打造的 Shader 包装语言，它允许开发人员使用熟悉的 [GLSL](https://www.khronos.org/files/opengles_shading_language.pdf) 语法编写自定义 Shader，同时提供了额外的高级抽象和管理特性以增强开发效率。在[材质组成](../material/composition/)章节我们提到，未引入 ShaderLab 前各类[渲染状态](./material/composition/#渲染状态)的设置需要开发者手动调用 api 进行设置，有了 ShaderLab 后，开发者能够直接在 "Shader" 文件中对渲染状态进行设置和指定，此外还能定义绑定 Shader 的材质渲染参数，映射到编辑器的 Inspector 面板中，方便开发者即时调整渲染效果。

尽管 ShaderLab 为着色器的编写引入了便利性，但它并不取代 GLSL，而是与之兼容。开发者可以在 ShaderLab 框架内编写原生 GLSL 代码块，享受两者的结合优势。ShaderLab 使用流程如下:

```mermaid
flowchart LR
   创建着色器 --> 编辑 shaderlab --> 调试 shaderlab
```

以下是一个简单的 ShaderLab 使用示例，其中包含了两个 Shader。`normal` Shader 定义了一个只实现 MVP 转换的顶点着色器，并且通过 Uniform 变量指定了像素颜色的片元着色器。另外，`lines` Shader 是一个使用 ShaderLab 进行改造的 [shadertoy](https://www.shadertoy.com/view/DtXfDr) 示例。

<playground src="shader-lab-simple.ts"></playground>