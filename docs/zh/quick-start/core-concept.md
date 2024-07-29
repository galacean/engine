---
order: 1
title: 核心概念
type: 基础知识
group: 快速上手
label: Basics/GettingStarted
---

我们通过一个立方体的例子，来了解一下编辑器和运行时中的核心概念。

## 编辑器使用

### 创建项目

在你登录之后，首先看到的是编辑器的首页，在这个页面中会显示所有你创建的项目。使用右上角的按钮来创建项目，点击后可以选择要创建的项目类型，2D 或 3D。我们选择 3D Project。

<img src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*luxKRKYGSBMAAAAAAAAAAAAADhuCAQ/original" alt="image-20230921161225962" style="zoom:50%;" />

### 创建立方体

首先，我们在 **层级面板** 中创建一个新的实体（[什么是实体？](https://galacean.antgroup.com/#/docs/latest/cn/entity)）。

<img src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*g-zmTr6rD9MAAAAAAAAAAAAADhuCAQ/original" alt="image-20230921161422138" style="zoom:50%;" />

我们用鼠标左键选中新建的实体节点，此时右侧的 **[检查器面板](/docs/interface/inspector)** 会显示出当前实体的一些可配置属性。因为我们的实体现在没有绑定任何组件（[什么是组件？](https://galacean.antgroup.com/#/docs/latest/cn/entity)），所以我们暂时只能调整实体的坐标信息这类的基础属性。

接下来，我们点击 **[检查器面板](/docs/interface/inspector)** 中的 `Add Component` 按钮唤起组件选单，然后选择添加 `Mesh Renderer` 组件（什么是 [Mesh Renderer?](/docs/graphics-renderer-meshRenderer)）。

<img src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*TrArQ7FmXc4AAAAAAAAAAAAADhuCAQ/original" alt="image-20230921161622497" style="zoom:50%;" />

这样，我们就给当前的实体新增了一个 `Mesh Renderer` 组件。但我们在主编辑区还看不到这个物体。需要为该组件添加 Mesh 和 Material 才行。编辑器会默认为 `Mesh Renderer` 组件添加一个不可编辑的默认材质，我们只需要为组件的 Mesh 属性添加一个 Cuboid Mesh 就可以在场景中看到它了。

<img src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*pc_6S5zuGhYAAAAAAAAAAAAADhuCAQ/original" alt="image-20230921161758541" style="zoom:50%;" />

默认的材质比较简单，所以接下来，我们来创建一个自定义的材质。

你也可以通过添加实体按钮中的 `3D Object` → `Cuboid` 来快速添加一个立方体模型，它会自动帮你添加一个 `Mesh Renderer` 组件：

<img src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*zlEzSLQ-L9cAAAAAAAAAAAAADhuCAQ/original" style="zoom:50%;" />

### 创建材质

首先，我们来上传纹理。我们可以把这些纹理文件直接拖动到 **资产管理面板，** 既可批量上传这些文件。

上传后，我们可以在面板中看到这些文件，依次是粗糙度纹理、法线纹理、基础颜色纹理。

<img src="https://gw.alipayobjects.com/zos/OasisHub/81ad7299-158b-4347-8e67-86b835980a04/image-20230921172453377.png" alt="image-20230921172453377" style="zoom:50%;" />

我们首先在 **资产管理面板** 中依次选择 `右键` → `Create` → `Material` 让编辑器会创建出一个默认的 PBR 材质。我们选中这个材质，此时 **[检查器面板](/docs/interface/inspector)** 会显示当前材质的配置选项。默认的材质比较简单，我们可以为这个材质增加一些纹理贴图，如基础纹理、粗糙度纹理、法线贴图。

<img src="https://gw.alipayobjects.com/zos/OasisHub/65bf4b63-3f09-4ad6-abc9-a9d26e173783/image-20230921173056885.png" alt="image-20230921173056885" style="zoom:50%;" />

接下来，我们把这些贴图配置到材质的对应属性当中。配置后我们再次选择上一步创建的实体节点，将 `Mesh Renderer` 组件的 `Material` 属性修改为我们刚刚创建的自定义材质。一个拥有金属质感的立方体就创建成功了。

<img src="https://mdn.alipayobjects.com/huamei_fvsq9p/afts/img/A*ni3KQ7jGK-0AAAAAAAAAAAAADqiTAQ/original" alt="Untitled" style="zoom:50%;" />

只不过，立方体现在看上去有点暗，需要把场景中的 [灯光](https://galacean.antgroup.com/#/docs/latest/cn/light) 调亮一点。我们在节点树中选择 `DirectLight` 节点，然后在检查器中调高 `Intensity`（光强度）属性。

现在看上去就比较正常了。
<img src="https://mdn.alipayobjects.com/huamei_fvsq9p/afts/img/A*n151R6vZ59oAAAAAAAAAAAAADqiTAQ/original" alt="Untitled" style="zoom:50%;" />

### 创建脚本

接下来，我们为这个节点再绑定一个 `Script` 组件（[什么是 Script 组件?](https://galacean.antgroup.com/#/docs/latest/cn/script)）。

1. 我们继续使用上述方式在 **[检查器面板](/docs/interface/inspector)** 中添加 `Script` 组件
2. 接下来，我们在 **[资产面板](/docs/assets-interface)** 中 `右键` → `Create` → `Script` 创建一个 `Script` 资产
3. 最后，在 **[检查器面板](/docs/interface/inspector)** 中将刚创建的脚本文件绑定到脚本组件上

> ⚠️ 注意，如果你没有把脚本资产绑定到实体的脚本组件上，则脚本不会运行

创建脚本后，我们可以 **双击它** 来跳转到代码编辑器页面。

<img src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*gmIjSbbNHZ0AAAAAAAAAAAAADhuCAQ/original" alt="image-20230921180953712" style="zoom:50%;" />

进入代码编辑器后，我们写一个非常简单的旋转功能：

```ts
// Script.ts
import { Script } from "@galacean/engine";

export default class extends Script {
  onUpdate(deltaTime: number) {
    this.entity.transform.rotate(1, 1, 1);
  }
}
```

在写好代码后，保存（`⌘+s`）, 右侧预览区就可以实时的看到整个场景的效果。

### 导出项目

现在，我们已经完成了在编辑器中的基础开发工作，接下来我们来导出这个项目到本地。

我们点击左侧工具栏的 **下载** 按钮，会唤起导出界面，我们这里把项目名改为 “box”，然后点击 `Download` 按钮，编辑器就会把项目打包为一个 `box.zip` 文件下载。

<img src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*mmoIRqIt30oAAAAAAAAAAAAADhuCAQ/original" alt="image-20230921162204014" style="zoom:50%;" />

项目打包完成后，我们使用 VsCode 打开 box 项目，运行 `npm install` & `npm run dev` ，可以看到项目已经能够正常运行了。

## 脚本使用

<playground src="scene-basic.ts"></playground>

## 引入模块

我们开始使用 [TypeScript](https://www.typescriptlang.org/) 编写引擎代码。如果你还不太适应 TypeScript，使用 JavaScript 也一样可以运行，并且同样可以享受到引擎 API 提示（通过使用 [VSCode](https://code.visualstudio.com/) 等 IDE 进行编程）。

回到我们的编程，为了实现这样一个功能，需要在我们的工程里引入如下 Galacean 引擎的类：

```typescript
import {
  WebGLEngine,
  Camera,
  MeshRenderer,
  PrimitiveMesh,
  BlinnPhongMaterial,
  DirectLight,
  Script,
  Vector3,
  Vector4,
  Color,
} from "@galacean/engine";
```

我们先来简单认识一下这些类：

| 类型           | 类名                                                                                    | 释义                                                                                                                                                                  |
| -------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WebGL 引擎类   | [WebGLEngine](${api}rhi-webgl/WebGLEngine)                                              | WebGL 平台引擎，支持 WebGL1.0 和 WebGL2.0，它能够控制画布的一切行为，包括资源管理、场景管理、执行/暂停/继续、垂直同步等功能。(详见 [引擎](/docs/core/engine) 章节。) |
| 组件类         | [Camera](/apis/core/#Camera)                                                             | 相机，是一个图形引擎对 3D 投影的抽象概念，作用好比现实世界中的摄像机或眼睛，如果不加相机，画布将什么都画不出来。（详见 [相机](/docs/graphics-camera) 章节）          |
|                | [DirectLight](/apis/core/#DirectLight)                                                   | 直接光，是光照的一种，光照使场景更有层次感，使用光照，能建立更真实的三维场景。（详见 [光照](/docs/graphics-light) 章节）                                             |
|                | [Script](/apis/core/#Script)                                                             | 脚本，是衔接引擎能力和游戏逻辑的纽带，可以通过它来扩展引擎的功能，也可以脚本组件提供的生命周期钩子函数中编写自己的游戏逻辑代码。（详见 [脚本](/docs/script) 章节）   |
|                | [MeshRenderer](/apis/core/#MeshRenderer)                                                 | 网格渲染器，使用网格对象（这个例子中就是立方体）作为几何体轮廓的数据源                                                                                                |
| 几何体和材质类 | [PrimitiveMesh](/apis/core/#PrimitiveMesh)                                               | 基础几何体，提供了创建立方体、球体等网格对象的便捷方法。（详见 [内置几何体](/docs/graphics-model) 章节）                                                             |
|                | [BlinnPhongMaterial](/apis/core/#BlinnPhongMaterial)                                     | 材质定义了如何渲染这个立方体，BlinnPhong 材质是经典的材质之一。（详见 [材质](/docs/graphics-material) 章节）                                                         |
| 数学库相关类   | [Vector3](/apis/math/#Vector3), [Vector4](/apis/math/#Vector4), [Color](/apis/math/#Color) | 这几个类是数学计算的一些基本单元，用来计算立方体的位置、颜色等。（详见 [数学库](/docs/core/math) 章节）                                                              |

## 创建引擎实例

创建引擎实例，参数 `canvas` 是 _Canvas_ 元素的 `id`，若 `id` 不同请自行替换。如上文所述，通过 [resizeByClientSize](${api}rhi-webgl/WebCanvas#resizeByClientSize) 方法重设画布高宽。

```typescript
const engine = await WebGLEngine.create({ canvas: "canvas" });
engine.canvas.resizeByClientSize();
```

## 创建场景根节点

值得注意的是，一个引擎实例可能包含多个场景实例，如果为了在当前激活的场景中添加一个立方体，需要通过引擎的场景管理器 `engine.sceneManager` 获得当前激活的场景。

获得场景后，通过场景的 `createRootEntity` 方法创建一个**根实体**。场景中的根实体是场景树的根节点。

```typescript
const scene = engine.sceneManager.activeScene;
const rootEntity = scene.createRootEntity("root");
```

## 创建一个相机实体

在 Galacean Engine 中，功能是以组件形式添加到实体上的。首先，我们先创建一个实体用来添加相机组件。

创建完成之后，通过实体上自带的变换组件 `transform` 来改变相机的位置和朝向。然后给这个实体添加相机组件 `Camera`。

```typescript
let cameraEntity = rootEntity.createChild("camera_entity");

cameraEntity.transform.position = new Vector3(0, 5, 10);
cameraEntity.transform.lookAt(new Vector3(0, 0, 0));

let camera = cameraEntity.addComponent(Camera);
```

## 创建光照

同样的，光照也是通过组件形式挂载到实体上。创建完实体之后，添加直接光组件 `DirectLight`，设置直接光组件的颜色、强度属性和光照角度来获得合适的光照效果。

```typescript
let lightEntity = rootEntity.createChild("light");

let directLight = lightEntity.addComponent(DirectLight);
directLight.color = new Color(1.0, 1.0, 1.0);
directLight.intensity = 0.5;

lightEntity.transform.rotation = new Vector3(45, 45, 45);
```

## 创建立方体

再创建一个实体用来挂载立方体网格渲染组件。`MeshRenderer` 是网格渲染器组件，通过 `.mesh` 属性设置成 `PrimitiveMesh` 创建的立方体数据，通过 `setMaterial` 方法把立方体的材质设置成 BlinnPhong。

```typescript
let cubeEntity = rootEntity.createChild("cube");
let cube = cubeEntity.addComponent(MeshRenderer);
cube.mesh = PrimitiveMesh.createCuboid(engine, 2, 2, 2);
cube.setMaterial(new BlinnPhongMaterial(engine));
```

## 启动引擎

一切都准备好了，让我们用一行代码来启动引擎吧！

```typescript
engine.run();
```
