---
order: 6
title: Model Optimization
type: Graphics
group: Model
label: Graphics/Model
---

Model optimization generally starts from the following points:

- Mesh: **Reduce the number of vertices and faces**, **compress mesh data**
- Texture: **Adjust texture size** (e.g., from **1024 \* 1024** -> **512 \* 512**), use **compressed textures**
- Animation: **Compress animation data**

## Best Practices

In the editor, we can optimize the model in the following ways:

1. Use [Quantize](https://github.com/KhronosGroup/glTF/blob/main/extensions/2.0/Khronos/KHR_mesh_quantization/README.md) to compress mesh data. When exporting the project, check the GlTF Quantize option to quantize and compress the mesh.
1. Use [Meshopt](https://github.com/KhronosGroup/glTF/blob/main/extensions/2.0/Vendor/EXT_meshopt_compression/README.md) to further compress mesh data.

<img src="https://mdn.alipayobjects.com/rms/afts/img/A*NiWATbLoZFkAAAAAAAAAAAAAARQnAQ/original/image-20240228171935612.png" alt="image-20240228171935612" style="zoom:50%;" />

Compression may affect the precision of the model mesh, but in most cases, it is difficult to distinguish with the naked eye.
