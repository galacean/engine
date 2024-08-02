---
order: 1
title: 快速开始
label: Basics
---

我们通过一个“旋转的小鸭子”的例子，来了解一下引擎的使用。

## 创建项目

在你登录之后，首先看到的是编辑器的首页，在这个页面中会显示所有你创建的项目。使用右上角的按钮来创建项目，点击后可以选择要创建的项目类型，2D 或 3D。我们选择 3D Project。

<img src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*luxKRKYGSBMAAAAAAAAAAAAADhuCAQ/original" alt="image-20230921161225962" style="zoom:50%;" />

此时会打开一个新的空白工程，场景中内置了一个相机和一个平行光。

<img src="https://gw.alipayobjects.com/zos/OasisHub/92b9b53e-63df-4165-bb53-d130bde7a731/image-20240705161613717.png" alt="image-20240705161613717" style="zoom:50%;" />

## 搭建场景

在此之前先解释一下游戏引擎中的基本概念：

| 概念     | 解释                                                         |
| -------- | ------------------------------------------------------------ |
| 场景     | 一个包含所有2D/3D元素的环境                                  |
| 实体     | 构成场景的基本单位，代表场景中的任何一个具有独立存在意义的对象 |
| 组件     | 是实体功能的具体实现，每个组件都负责处理实体的一个具体功能   |
| 脚本组件 | 是一种特殊类型的组件，它为实体赋予动态行为和逻辑控制能力     |
| 资产     | 用于构建场景的可重用资源的总称，比如 3D 模型、材质等         |
| 3D模型   | 指通过计算机软件创建的，能够在三维空间中表示物体形状和外观的数字化表现形式。包括角色、环境物件（如建筑、植被）、道具（武器、家具）等的三维几何形状，通常带有纹理和材质定义 |

### 放入鸭子

首先，点击这个[链接](https://gw.alipayobjects.com/os/bmw-prod/6cb8f543-285c-491a-8cfd-57a1160dc9ab.glb)下载一个鸭子的 3D 模型。把下载到本地的模型拖到资产面板中，稍过片刻就会看到模型已经上传到了编辑器中：

<img src="https://gw.alipayobjects.com/zos/OasisHub/a73635d5-9f6f-4dc0-aa32-af8d49b669a6/image-20240705162025015.png" alt="image-20240705162025015" style="zoom:50%;" />

接着，把资产面板中的模型拖到场景视图中，就可以在场景中渲染这个 3D 模型了，此时场景的节点树中就增加了一个新的实体。

<img src="https://gw.alipayobjects.com/zos/OasisHub/cfbdb410-9091-4246-a9ba-1cf06cd4fb93/image-20240705162359455.png" alt="image-20240705162359455" style="zoom:50%;" />

### 调整鸭子的变换

首先，为了更好地预览最后在移动设备上的效果，我们可以选中**相机**实体，可以通过定位按钮明确当前预览的相机在场景中的位置，通过选择不同尺寸的移动设备来模拟真机预览，也可以选择锁定预览窗口，这样在选择其他实体的时候预览窗口就不会消失。

<img src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*V33tQ4FZlVsAAAAAAAAAAAAADhuCAQ/original" alt="image-20240705162931132" style="zoom:50%;" />

接着，我们选中鸭子，通过选择上方工具栏中的**移动**、**旋转**、**缩放**等[变换](/docs/core/transform)操作。切换不同的变换类型，鸭子身上也会随之切换不同的操作手柄。这些操作手柄和大部分 3D 软件的交互是类似的，如果你是第一次使用这类手柄，请不用担心，把鼠标移到手柄上，随意摆弄一下，就能很快上手。通过简单的变换操作，我们就能把鸭子的位置、角度、大小都调整到符合我们预期的效果。左上角的相机预览器会实时地展示你调整的效果。

<img src="https://gw.alipayobjects.com/zos/OasisHub/4f2955d5-41e8-4cc3-81ef-5f1fee6a8b59/image-20240705163544657.png" alt="image-20240705163544657" style="zoom:50%;" />

### 调整灯光

此时鸭子有点暗，我们选中节点树上的 `DirectLight` 灯光实体，在右侧的观察面板中拖动滑杆适当调整一下灯管的强度，让场景的照明更加亮一点。

<img src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*lA07Ro1SfuwAAAAAAAAAAAAADhuCAQ/original" alt="image-20240705164814972" style="zoom:80%;" />

### 让小鸭子转起来

首先，我们在资产面板 中 *右键 → Create → New Empty Script* 创建一个 Script 资产。

<img src="https://gw.alipayobjects.com/zos/OasisHub/e47a9c4e-bfd8-481d-8233-a7daae00f500/image-20240705170003841.png" alt="image-20240705170003841" style="zoom:50%;" />

创建完成之后，可以看到资产面板中多了一个 Script 资产。

<img src="https://gw.alipayobjects.com/zos/OasisHub/690d8428-2295-4c07-bfb0-6bdace57cd03/image-20240705170256694.png" alt="image-20240705170256694" style="zoom:50%;" />

接着，我们选中鸭子实体，在右侧的检查器面板中点击 **Add Component** 添加一个 [ Script ](/docs/script/class) 组件。

<img src="https://gw.alipayobjects.com/zos/OasisHub/c8879990-82c2-4ebd-a8c4-028fcecea364/image-20240705165619069.png" alt="image-20240705165619069" style="zoom:50%;" />

点击 **Select asset** 选择刚创建的 Script，这样脚本就绑定到该实体上了，也就是说脚本的生命周期函数会作用到该实体上。

<img src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*MfjMQ7KA0B0AAAAAAAAAAAAADhuCAQ/original" alt="image-20240705170349805" style="zoom:80%;" />

创建脚本后，我们可以 **双击它** 来跳转到代码编辑器页面。

<img src="https://gw.alipayobjects.com/zos/OasisHub/73374e9e-77f2-46dd-baed-da79b8601dfa/image-20240705170853613.png" alt="image-20240705170853613" style="zoom:50%;" />

进入代码编辑器后，我们在 `onUpdate` 函数中加一行代码，让鸭子沿着 Y 轴旋转。写好代码后，保存（`⌘+s`）, 右侧预览区就可以实时的看到整个场景的效果。

```ts
// Script.ts
import { Script } from "@galacean/engine";

export default class extends Script {
  onUpdate(deltaTime: number) {
     this.entity.transform.rotate(0, 1, 0);
  }
}
```

## 导出项目

我们已经完成了在编辑器中的开发工作，接下来我们来导出这个项目到本地。点击左侧工具栏的 **下载** 按钮，会唤起导出界面，我们这里把项目名改为 “duck”，然后点击 `Download` 按钮，编辑器就会把项目打包为一个 `duck.zip` 文件下载。

<img src="https://gw.alipayobjects.com/zos/OasisHub/26a6e282-689a-4c69-903f-10c565a9746c/image-20240705171230958.png" alt="image-20240705171230958" style="zoom:50%;" />

项目打包完成后，我们使用 VsCode 打开 box 项目，运行 `npm install` & `npm run dev` ，可以看到项目已经能够正常运行了。