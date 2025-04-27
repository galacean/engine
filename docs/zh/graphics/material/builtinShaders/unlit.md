---
title: Unlit
---

在一些简单的场景中，可能不希望计算光照，引擎提供了 [UnlitMaterial](/apis/core/#UnlitMaterial)，使用了最精简的 shader 代码，只需要提供颜色或者纹理即可渲染。Unlit 材质适用于烘焙好的模型渲染，它只需要设置一张基本纹理或者颜色，即可展现离线渲染得到的高质量渲染结果，但是缺点是无法实时展现光影交互，因为 Unlit 由纹理决定渲染，不受任何光照影响。

<playground src="unlit-material.ts"></playground>

## 编辑器使用

<img src="https://gw.alipayobjects.com/zos/OasisHub/6be78a08-3075-4cd1-8cad-9757fc34f695/unlit.gif" alt="unlit" style="zoom:100%;" />

## 参数介绍

| 参数 | 应用 |
| :-- | :-- |
| [baseColor](/apis/core/#UnlitMaterial-baseColor) | 基础颜色。**基础颜色 \* 基础颜色纹理 = 最后的颜色。** |
| [baseTexture](/apis/core/#UnlitMaterial-baseTexture) | 基础纹理。搭配基础颜色使用，是个相乘的关系。 |
| [tilingOffset](/apis/core/#UnlitMaterial-tilingOffset) | 纹理坐标的缩放与偏移。是一个 Vector4 数据，分别控制纹理坐标在 uv 方向上的缩放和偏移，参考 [案例](/embed/tiling-offset) |

如果需要通过脚本使用材质，可以前往[材质的使用教程](/docs/graphics/material/script)。

## Blender 导出 Unlit 材质

如[烘焙教程](/docs/art/bake-blender)介绍，如果我们已经制作完了烘焙贴图，希望有一种**便捷材质**，颜色只由烘焙纹理影响，不用添加灯光，不用调试法线，也不用调试金属粗糙度等高阶属性，那么你可以试试 Galacean 的 [UnlitMaterial](/apis/core/#UnlitMaterial), glTF 有专门的[KHR_materials_unlit ](https://github.com/KhronosGroup/glTF/tree/master/extensions/2.0/Khronos/KHR_materials_unlit)插件，Galacean 会解析插件，生成 Unlit 材质。

<img src="https://gw.alipayobjects.com/zos/OasisHub/39965fc2-3fc2-44b9-a294-a04eb4441120/1623652741734-090284d5-9b1a-4db8-9231-dc3f4d188a38-20210614150743080.png" alt="image.png" style="zoom:50%;" />

测试模型：[TREX.zip](https://www.yuque.com/attachments/yuque/0/2021/zip/381718/1623651429048-7f6a3610-d5cb-4a73-97f5-0d37d0c63b2c.zip?_lake_card=%7B%22src%22%3A%22https%3A%2F%2Fwww.yuque.com%2Fattachments%2Fyuque%2F0%2F2021%2Fzip%2F381718%2F1623651429048-7f6a3610-d5cb-4a73-97f5-0d37d0c63b2c.zip%22%2C%22name%22%3A%22TREX.zip%22%2C%22size%22%3A499161%2C%22type%22%3A%22application%2Fx-zip-compressed%22%2C%22ext%22%3A%22zip%22%2C%22status%22%3A%22done%22%2C%22taskId%22%3A%22u458bcbec-d647-4328-8036-3d5eb12860f%22%2C%22taskType%22%3A%22upload%22%2C%22id%22%3A%22ua8a5baad%22%2C%22card%22%3A%22file%22%7D)

接下来介绍如何利用 Blender 软件导出有 unlit 插件的 glTF 文件 。

1. 导入模型

![image.png](https://gw.alipayobjects.com/zos/OasisHub/e5dbfb61-5c0c-4ca5-8c7f-bde353d4c211/1623651809057-138f49cf-6fe7-4f54-8161-c7e157ec85fd-20210614150752343.png)

2. 修改 Shader

默认的 shader 类型为 BSDF ，我们需要将材质属性栏 surface 里面的 shader 类型修改为 **Background**。

![image.png](https://gw.alipayobjects.com/zos/OasisHub/abf1e279-1f78-4d21-8c1f-d58d7f74992c/1623652169374-7f39e5f0-6639-4795-8565-b8f0b09420ed-20210614150804567.png)

![image.png](https://gw.alipayobjects.com/zos/OasisHub/c8c51e5f-c7c6-44a3-87e2-dc649e13fddb/1623652230768-69cd6f7e-175d-4f9f-9042-b3629d422b8e.png)

3. 添加烘焙纹理

添加烘焙好的纹理，将 Color 和 Shader 连接在一起

![image.png](https://gw.alipayobjects.com/zos/OasisHub/50c69e7b-c099-4a2d-b546-8a55ff4f9309/1623652264008-7ae4c13c-6430-44b0-995e-2c23c9f117a7-20210614150846797.png)

![image.png](https://gw.alipayobjects.com/zos/OasisHub/6ed13e19-a9e5-4454-a0d5-ad27b3cabe14/1623652368637-6dda44be-4cde-4f65-a72f-d39b5d3f60ce.png)

![image.png](https://gw.alipayobjects.com/zos/OasisHub/e9a99c9c-f661-4666-86bc-d8e91030c0f7/1623652380351-501dd929-7f96-4578-b49a-11724a0782a7.png)

4. 导出 glTF

若预览正常，导出 glTF 。

![image.png](https://gw.alipayobjects.com/zos/OasisHub/4b6b5f8f-ebd2-46af-85c7-9a26b5f66a2e/1623652403568-450291a8-1a0b-4cf4-8e71-c183a05632b0-20210614150902221.png)

![image.png](https://gw.alipayobjects.com/zos/OasisHub/1fe38185-399e-4f56-bff4-c39ba4ae3a2a/1623652462007-85b065a3-69fa-4d80-9dfd-834ef66da12a.png)

将刚才导出来的 glTF 文件拖入编辑器或者 [glTF 预览器](https://galacean.antgroup.com/engine/gltf-viewer)，若材质类型为 **UnlitMaterial**，说明已经导出了 glTF 的 [KHR_materials_unlit](https://github.com/KhronosGroup/glTF/tree/master/extensions/2.0/Khronos/KHR_materials_unlit) 插件，且 Galacean 已经解析成 Unlit 材质。

![image.png](https://gw.alipayobjects.com/zos/OasisHub/fbb6ba43-f7d7-4757-a1d3-590083d30573/1623652636074-d8bb8437-f885-43fd-8957-8e14ae9fd8c0-20210614150914493.png)
