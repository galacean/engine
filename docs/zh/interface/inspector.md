---
order: 4
title: 检查器面板
type: 基础知识
group: 界面
label: Basics/Interface
---

检查器面板位于编辑器右侧，它会是你在使用编辑器的过程中最常用的面板。基于你当前选择所选择的东西，检查器面板会显示出相对应的属性。你可以使用检查器面板来编辑场景中几乎所有的事物，如场景、实体、组件、资产等等。

<div style="display: flex; gap: 20px;">
  <figure style="flex:1;">
  <img src="https://gw.alipayobjects.com/zos/OasisHub/1d2e383b-2451-4d0e-8338-a16b1a99ce92/image-20240318174937155.png" alt="image-20240122144004260" style="zoom:50%;" />
  <figcaption style="text-align:center; color: #889096;font-size:12px">场景检查器</figcaption>
	</figure>
  <figure style="flex:1;">
    <img src="https://gw.alipayobjects.com/zos/OasisHub/bb8e0881-c716-4fc2-89c0-d7b4b01d668d/image-20240318175043180.png" alt="image-20240122144102202" style="zoom:50%;" />
    <figcaption style="text-align:center; color: #889096;font-size:12px">实体检查器</figcaption>
  </figure>
  <figure style="flex:1;">
    <img src="https://gw.alipayobjects.com/zos/OasisHub/1ce2c623-bab4-45dd-a0ef-12ab2e00e9a9/image-20240318175341251.png" alt="image-20240122144141450" style="zoom:50%;" />
    <figcaption style="text-align:center; color: #889096;font-size:12px">资产检查器</figcaption>
  </figure>
</div>


## 属性类型

检查器面板中的属性可以分成两大类：

- **基本数值类型**：数字调节、颜色选择、属性切换等
- **引用类型**：通常是资源，比如材质选择、纹理选择等

### 数字调节

检查器中提供了很多数字调节的入口。针对不同的属性，数字可调节的范围，每次调整的大小都会不同。最典型的是调整 `Transform` 组件的位置、旋转、缩放属性值。

你可以通过拖拽输入框右侧的滑块来快速调整数字的大小。在拖拽时，按住 `⌘`（window 上为 `ctrl`）可以更精确地调整数字的大小（精度为原 step 的 1/10）。

<img src="https://gw.alipayobjects.com/zos/OasisHub/b14cd188-22bf-4d78-b327-07a331f3c58b/image-20240318175444343.png" alt="image-20240318175444343" style="zoom:50%;" />

一些可以调节的属性是以滑动条的形式出现的。你可以拖动滑块来快速调整数字的大小，如灯光的 `Intensity`。同样的，在拖动滑块时，按住 `⌘`（window 上为 `ctrl`）可以更精确的调整数字的大小。

<img src="https://gw.alipayobjects.com/zos/OasisHub/440cd2ed-d1eb-474f-be7e-7a35cac8c954/image-20240318175518354.png" alt="image-20240318175518354" style="zoom:50%;" />

还有一些数字调节的属性是以输入框和按钮的形式出现的，如阴影的 `Near Plane`。这些属性往往拥有更精确的步进大小（如 0.1, 1, 10）。点击按钮可以直接以步进长度来增加或减小数值。

<img src="https://gw.alipayobjects.com/zos/OasisHub/14c8726c-1a91-4206-8e73-93d436109172/image-20240318175638055.png" alt="image-20240318175638055" style="zoom:50%;" />

### 颜色面板

一些属性需要调整颜色，如光照、场景的背景色，亦或者材质的自发光颜色等。想要调整颜色，你需要点击左侧的颜色按钮来唤起颜色选择器。在颜色选择器中，你可以使用 HUE 来选择颜色，调整颜色的透明度；也可以在输入框来调整颜色具体的 RGBA 数值。点击 <img src="https://gw.alipayobjects.com/zos/OasisHub/dc030a4b-8813-4ea2-acb0-549c04363b1d/image-20230926110451443.png" alt="image-20230926110451443" style="zoom: 33%;" />按钮可以在 HSLA，RGBA 和 HEXA 三种模式下进行切换。

<img src="https://gw.alipayobjects.com/zos/OasisHub/d340d0ea-a88a-4b82-b6c4-c69d3f4b8c4e/image-20240318175748734.png" alt="image-20240318175748734" style="zoom:50%;" />

### 资产选择浮窗

一些属性需要引用到需要的资产，在这种情况下，你可以点击资产选择器的输入框来唤起资产选择浮窗。不同的属性需要的资产类型不同，但资产选择器已经默认配置好了相应的过滤器，直接选择即可。

资产选择浮窗中还提供了一个搜索框，你可以使用它来更精确的找到对应的资产。

<div style="display: flex; gap: 20px;">
  <figure style="flex:1;">
  <img src="https://gw.alipayobjects.com/zos/OasisHub/b7845736-d13a-4332-af75-65cf1e2bb268/image-20240318175855279.png" alt="image-20240122143554973" style="zoom:50%;" />
  <figcaption style="text-align:center; color: #889096;font-size:12px">Mesh Asset Picker</figcaption>
	</figure>
  <figure style="flex:1;">
    <img src="https://gw.alipayobjects.com/zos/OasisHub/b8463854-4343-4dea-b1cf-713a7c617288/image-20240318175957149.png" alt="image-20240122134039213" style="zoom:50%;" />
    <figcaption style="text-align:center; color: #889096;font-size:12px">Texture Asset Picker</figcaption>
  </figure>
</div>

