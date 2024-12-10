---
order: 3
title: 数字人项目
---

## 数字人相关技术

### 1. 模型制作

首先我们所有资产都是基于 [glTF](/docs/graphics/model/glTF) 标准制作，建模人员需要基于标准去制作模型、骨骼、动画等。

### 2. 渲染

一般来说，模型自带的 [PBR 材质](/docs/graphics/shader/builtins/pbr) 可以满足大部分渲染需求，当然，引擎也提供了头发、皮肤、眼睛等[数字人高级材质](/docs/graphics/shader/builtins/digitalHuman/hair)，搭配[后处理系统](/docs/graphics/postProcess/postProcess) 来使用，可以使整个数字人场景更加写实逼真。

### 3. 动画

动画我们一般分为身体动画、表情动画、嘴巴动画。其中身体动画需要我们使用[骨骼动画](/docs/graphics/renderer/skinnedMeshRenderer/#骨骼动画)实现；表情、嘴巴基于 [BlendShape 动画](/docs/graphics/renderer/skinnedMeshRenderer/#blendshape) 实现。

## 接入流程

### 1. 简单预览

如果你只是想要简单的预览数字人的渲染、动画效果，可以将模型导入 [glTF 预览器](https://galacean.antgroup.com/engine/gltf-viewer/)，切换动画进行查看。

### 2. 编辑器项目

你可以按照 [导入教程](/docs/graphics/model/importGlTF/) 等一步步实现编辑器的预览，最后进行[项目导出](/docs/assets/build/)到需要的平台。

### 3. 高级动画定制

如果你有稍微复杂一点的需求，比如需要自己 K 动画帧，制作动画状态机，那么可以按照[动画教程](/docs/animation/overview/)进行更加深入的了解。

### 4. 算法驱动（灵境平台）

更进一步，如果你需要 **文本转语音动画** 等算法驱动能力，比如算法驱动口型播报，身体动画决策，那么你可以前往[灵境平台](https://www.yuque.com/em8gt4/yrf9pg/cw6h54uwskdsk4as)进行开通体验。

编辑器和灵境的打通流程也非常简单，按照上述步骤制作完形象后，项目导出成一个 Project URL 交付给灵境平台即可进行预览和驱动。

<img src="https://gw.alipayobjects.com/zos/OasisHub/fb208c07-4e35-430d-8b5c-3b4376eb90a0/1698649775348-99ac51bf-0bb3-4c04-9de7-51658fd38887.png" alt="image.png" style="zoom:50%;" />
