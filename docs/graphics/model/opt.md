---
order: 6
title: 模型优化
type: 图形
group: 模型
label: Graphics/Model
---

模型的优化一般从以下几点入手：

- 网格：**缩减顶点数与面数**，**压缩网格数据**
- 纹理：**调整纹理尺寸**（如从 **1024 \* 1024** -> **512 \* 512**），使用**压缩纹理**
- 动画：**压缩动画数据**

## 最佳实践

在编辑器中，我们可以通过以下方式对模型进行优化：

1. 使用 [Quantize](https://github.com/KhronosGroup/glTF/blob/main/extensions/2.0/Khronos/KHR_mesh_quantization/README.md) 来压缩网格数据，在导出项目时勾选 GlTF Quantize 选项， 对网格进行量化压缩
1. 使用 [Meshopt](https://github.com/KhronosGroup/glTF/blob/main/extensions/2.0/Vendor/EXT_meshopt_compression/README.md) 进一步压缩网格数据

<img src="https://mdn.alipayobjects.com/rms/afts/img/A*NiWATbLoZFkAAAAAAAAAAAAAARQnAQ/original/image-20240228171935612.png" alt="image-20240228171935612" style="zoom:50%;" />

压缩可能会对模型网格精度造成一些影响，不过大部分情况下，肉眼很难区分。
