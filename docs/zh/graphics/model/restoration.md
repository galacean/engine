---
order: 5
title: 在编辑器中还原美术效果
type: 图形
group: 模型
label: Graphics/Model
---

![image.png](https://gw.alipayobjects.com/zos/OasisHub/5dd84590-7c37-4156-bb1a-498207880c75/1635493348596-92184a82-6aaa-4ab8-95e5-2d88762df213.png)

## 背景

Galacean 引擎目前有 3 种方式调试材质：

1. 通过代码修改材质属性，参考[教程](/docs/graphics/material/material)。

2. 通过 Galacean Editor 可视化调试，参考[教程](/docs/graphics/material/material)。

3. **通过 3D 建模软件调好后导出 [glTF](/docs/graphics/model/glTF/)**

前两种方式直接使用引擎渲染，所见即所得，没有视觉上的差异。

但是设计师一般会使用第 3 种方式，即在 C4D、Blender 等建模软件中调好了视觉效果，然后导出到引擎中进行预览，发现渲染结果不一致，甚至有很大的偏差，主要原因在于：

- **不同软件的渲染算法不同。**

- **光照不一样。**

- **部分资产无法导出到 glTF 文件。**

针对造成差异的这些原因，可以通过以下方法来获取最大程度的视觉还原度：

- **通过烘焙贴图，导出 Unlit 材质到引擎**

- **使用相同的环境贴图(一般为 HDRI 文件)、直接光照等变量。**

- **在建模软件中只调试可以导出到 glTF 的属性和资产。**

如果你也遇到了上述问题，可以先参考本教程，找到具体的原因，然后再参照相应的解决方法。如果还是无法解决问题，可以联系我们团队，我们会不断改进本教程。

## 原因

### 渲染算法差异

目前在实时渲染领域应用的最多的是 PBR 算法，拥有能量守恒、物理正确、易操作等优点，但是不同软件的具体实现算法是不一样的，使得渲染结果也不一样。Galacean 使用的是 **Cook-Torrance BRDF** 反射率方程，并针对移动端做了优化。

值得一提的是，虽然算法不同会造成一定的视觉差异，但是其物理规律还是一致的。比如，金属度越大，环境反射越强，漫反射越弱；粗糙度越大，环境反射越模糊，如下图：

![image.png](https://gw.alipayobjects.com/zos/OasisHub/ddfe44e2-c9ab-4692-b62f-b43b8965ee4c/1635432936926-b26c9652-6d95-4160-9743-b954025dfe32.png)

### 光照差异

跟现实世界一样，3D 场景也可以添加[直接光与环境光](/docs/graphics/light/light/)。Galacean 场景中默认是**没有**光源的，只有一个偏向蓝色的[纯色漫反射](/apis/core/#AmbientLight-diffuseSolidColor)，如下图左一；而很多建模软件中是自带光源的：

![image.png](https://gw.alipayobjects.com/zos/OasisHub/391e9bd9-945d-474d-b3fb-8cb0490e2b6f/1635434650361-60d7f40f-9f22-4e48-8865-141415d638f9.png)

环境光基于 [立方纹理](/docs/graphics/texture/cube) 开启 IBL 模式，需要绑定一张 HDRI 贴图用来模拟周边环境，可以从[网上下载](https://polyhaven.com/hdris)。Galacean 场景中默认是没有绑定 HDRI 贴图的，而很多建模软件是自带了一张比较好看的周边环境的：

![image.png](https://gw.alipayobjects.com/zos/OasisHub/61c2287b-0793-4763-a5f5-70567fcdf106/1635477315862-08b0c680-029b-400b-8600-1d8cf7a20c60.png)

### glTF 支持度差异

Galacean 引擎和建模软件的连通渠道是 [glTF 文件](/docs/graphics/model/glTF/)。glTF 支持标准的 [PBR 属性](https://www.khronos.org/registry/glTF/specs/2.0/glTF-2.0.html#reference-material-pbrmetallicroughness)和[通用材质属性](https://www.khronos.org/registry/glTF/specs/2.0/glTF-2.0.html#reference-material)，并支持 [ClearCoat](https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Khronos/KHR_materials_clearcoat) 等插件，如下图。因此建模软件中的操作只要能导出到 glTF，引擎都能通过加载器加载，而那些额外的操作，比如 [vRay](https://www.chaosgroup.com/cn/vray/3ds-max) 材质的一些参数，是无法导出到 glTF 文件的。

![image.png](https://gw.alipayobjects.com/zos/OasisHub/2010b748-ab8b-4e46-8b15-3aee4daa71f9/1635434775734-f8454efe-d268-4f80-87ab-40f1cddf96ea.png)

![image.png](https://gw.alipayobjects.com/zos/OasisHub/acd35018-dc09-404b-a735-85a981384df1/1635434736607-cc408f27-a7d7-4a30-a7ea-e083f209d2c9.png)

## 解决方法

保证视觉还原度的首要前提是在同一个场景下调试材质，即相同的光照，相同的环境光等等，然后再选择实时渲染方案或者是烘焙方案。

### 统一光照

- 直接光

前面说到，引擎默认不带直接光，那么保持还原度最简单的方法，就是删除建模软件中的灯光，保证建模软件和 Galacean 引擎中都只有环境光（性能最好）。

<img src="https://gw.alipayobjects.com/zos/OasisHub/dc228a19-8ca7-4ffa-ae0f-6634d0aad373/1635493208445-f1a4f6ac-28bf-4e22-8067-552ad88411b6.png" alt="image.png" style="zoom:50%;" />

如果某些场景确实需要添加直接光，那么请保证建模软件可以导出 [glTF 灯光插件](https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Khronos/KHR_lights_punctual) (Google 搜索关键词 "\***\* 建模软件 KHR_lights_punctual" )，比如 Blender 导出 glTF 的时候勾选上 **Punctual Lights。\*\*

<img src="https://gw.alipayobjects.com/zos/OasisHub/63a252d3-7f24-4b58-bfcd-45201c479b3c/1635494985124-29f86a28-2793-435a-8230-c9fea61bb60d.png" alt="image.png" style="zoom:50%;" />

如果建模软件不支持导出该光照插件，可以中转到 Blender 进行导出，或者和开发人员口头描述一下光照数据。

- 环境光

前面说到，引擎默认不带环境贴图，即 HDRI 贴图，但是建模软件一般都是自带的，比如 Blender：

<img src="https://gw.alipayobjects.com/zos/OasisHub/f1683b34-c991-490f-835a-918693debbdf/1635495607766-f7f7deea-656a-4f7b-90cd-1ebf2364f6a7.png" alt="image.png" style="zoom:50%;" />

我们可以先从[网上下载](https://polyhaven.com/hdris)喜欢的 HDRI 图片，然后在建模软件中进行调试，觉得满意后，将该最终 HDRI 交付给开发人员（因为 glTF 不支持导出 HDR）。

在建模软件中绑定环境贴图的方法很简单，可以 Google 搜索关键词 "\*\*\* 建模软件 environment IBL" ，拿 Blender 举例：

<img src="https://gw.alipayobjects.com/zos/OasisHub/52e54319-7c7f-42a5-bf16-e7bca854734c/1635496231128-2b912395-f1eb-48cd-b5e9-323cb28c8c49.png" alt="image.png" style="zoom:50%;" />

### 实时渲染方案

- 渲染方案

统一光照之后，我们就可以选择渲染方案了，如果你希望材质受到光照影响，能够实时光影交互，或者有一些透明、折射方面的需求，那么你应该选择实时渲染方案，即引擎的 PBR 方案。

- 调试材质

前面说到 Galacean PBR 使用的是 **Cook-Torrance BRDF** 反射率方程，在 Blender 中比较接近的是 Principled BSDF - GGX 算法：

<img src="https://gw.alipayobjects.com/zos/OasisHub/623b429e-b731-4c00-85ab-fd2cd270e695/1635496608900-f47ae7b7-e917-475a-9b24-74a91d485e8e.png" alt="image.png" style="zoom:50%;" />

可以通过 [Blender 官网教程](https://docs.blender.org/manual/en/2.80/addons/io_scene_gltf2.html#)参考如何调试可以导出到 glTF 的材质参数，其他建模软件同理，可以 Google 搜索关键词 “\*\*\* 建模软件 export glTF”。

还有一个比较简便的参考方式，就是在建模软件里面导入 glTF demo（[点击下载](https://gw.alipayobjects.com/os/bmw-prod/85faf9f8-8030-45b2-8ba3-09a61b3db0c3.glb)），这个 demo 里面的 PBR 属性比较全面，可以参考着调试，比如 Blender 导入后，材质面板显示如下：

![image.png](https://gw.alipayobjects.com/zos/OasisHub/6643f12a-6226-490f-b853-f962a38cb09b/1635499476109-753aae7a-5ffa-4d52-ace1-4eaaef81919f.png)

- 校验导出

导出 glTF 后，可以将文件拖拽到 [glTF 查看器](https://galacean.antgroup.com/#/gltf-viewer) 中，查看相应的颜色、纹理、参数等是否正确：

<img src="https://gw.alipayobjects.com/zos/OasisHub/a76d35e6-e222-4877-89a4-c44a117a1284/1635499678001-f7df3dc2-2219-4516-887b-fc5d51dc3521.png" alt="image.png" style="zoom:50%;" />

### 烘焙方案

不同于实时渲染，如果你的渲染场景完全静态，不需要光影交互，不需要要折射、透明等效果，那么使用烘焙方案会更加满足你的艺术创作，因为烘焙方案可以无视上文说的光照、glTF 支持度等问题；可以放心地使用建模软件的自带渲染器，[vRay](https://www.chaosgroup.com/cn/vray/3ds-max) 等强大插件，最后通过烘焙贴图，导出到 [glTF Unlit 插件](https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Khronos/KHR_materials_unlit)。

我们针对烘焙方案也提供了几篇教程，你也可以通过 Google 搜索“\*\*\* 建模软件 烘焙 KHR_materials_unlit” 等关键词学习更多细节：

- [《C4D 烘焙教程》](/docs/art/bake-c4d/)

- [《Blender 烘焙教程》](/docs/art/bake-blender)

### Galacean 预览插件(规划中)

我们后期还会投入插件开发人员，在各种建模软件中内置 Galacean 预览插件，保证所见即所得，省去 glTF 文件校验等步骤。
