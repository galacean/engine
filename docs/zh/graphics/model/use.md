---
order: 4
title: 模型的加载与使用
type: 图形
group: 模型
label: Graphics/Model
---

加载与使用模型资产，一般会遇到以下两种情况：

- 已经随场景文件预加载的模型，在脚本中的使用
- 未预加载的模型，在脚本中的加载与使用

在编辑器中，**放置在场景中的模型**都会随着场景文件被预先加载，依照步骤 **资产界面** -> **左键拖动模型缩略图** -> **拖动至[视图界面](/docs/interface-viewport)** -> **松开左键** -> **调整坐标** 即可将模型放置在对应场景中。

> 编辑器不能直接调整模型节点的 scale 属性, 所以通常情况下, 你需要把模型节点拖拽到一个 entity 节点下, 然后调整 entity 节点的 scale 属性。

<img src="https://gw.alipayobjects.com/zos/OasisHub/8e088349-f36d-4d16-a525-bbb63fe00105/import.gif" alt="import" style="zoom:100%;" />

这种情况下，在运行时只需寻找场景中特定的节点即可获取对应的模型对象。

```typescript
// 根据节点名寻找模型节点
const model1 = scene.findEntityByName("ModelName");
// 根据节点路径寻找模型节点
const model2 = scene.findEntityByPath("ModelPath");
```

## 加载模型

只要有模型的 URL 信息，我们就可以很方便地加载这个模型。

```typescript
engine.resourceManager
  .load({ url: "glTF's URL", type: AssetType.GLTF })
  .then((glTF: GLTFResource) => {
    // 获取 glTF 模型实例化的模型对象
    const root = glTF.instantiateSceneRoot();
    // 将模型对象添加到场景中
    scene.addRootEntity(root);
  });
```

在编辑器中，可以直接获取模型资产的 URL （ **[资产面板](/docs/assets-interface)** -> **右键模型资产缩略图** -> **Copy file info / Copy relative path**）：

<img src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*T6-QR7KrH8oAAAAAAAAAAAAADhuCAQ/original" alt="import" style="zoom: 50%;" />

没有导入编辑器的模型，对应的 URL 就是存放模型资产的路径。

## 加载进度

加载模型时也可以通过 [onProgress](/apis/core/#AssetPromise-onProgress) 事件来获取总任务/详细任务的加载进度。

```typescript
this.engine.resourceManager
  .load(["b.gltf"])
   .onProgress(
      (loaded, total) => {
        console.log("task loaded:", loaded, "task total:", total);
      },
      (url, loaded, total) => {
        console.log("task detail:", url, "loaded:", loaded, "total:", total);
      }
```

<img src="https://gw.alipayobjects.com/zos/OasisHub/b1623aee-4f1b-405a-b5b5-c63b64dbb9de/image-20240313112859472.png" alt="image-20240313112859472" style="zoom:50%;" />

## 使用模型

加载完毕的模型对象会返回包含了渲染信息和动画信息的根节点，它的使用和普通节点没有什么区别。

<playground src="gltf-basic.ts"></playground>

### 1. 选择场景根节点

glTF 可能包含多个场景根节点 `sceneRoots`，开发者可以手动选择希望实例化的根节点。

```typescript
engine.resourceManager
  .load({ url: "glTF's URL", type: AssetType.GLTF })
  .then((glTF: GLTFResource) => {
    // 选择根节点数组中下标为 1 的模型对象，默认下标为 0
    const root = glTF.instantiateSceneRoot(1);
    // 将模型对象添加到场景中
    scene.addRootEntity(root);
  });
```

### 2. 播放动画

若模型携带了动画信息，可以从根节点上获取 [Animator](/apis/core/#Animator) 组件，然后选择播放任意动画片段。

```typescript
engine.resourceManager
  .load({ url: "glTF's URL", type: AssetType.GLTF })
  .then((glTF: GLTFResource) => {
    // 获取 glTF 模型实例化的模型对象
    const root = glTF.instantiateSceneRoot();
    // 将模型对象添加到场景中
    scene.addRootEntity(root);
    // 获取 glTF 资产的动画信息
    const { animations } = glTF;
    // 获取模型对象挂载的动画组件
    const animation = root.getComponent(Animator);
    // 播放第一个动画
    animation.playAnimationClip(animations[0].name);
  });
```

### 3. 多材质切换

glTF [多材质插件](https://github.com/KhronosGroup/glTF/tree/master/extensions/2.0/Khronos/KHR_materials_variants) 可以用来切换材质。

```typescript
engine.resourceManager
  .load({ url: "glTF's URL", type: AssetType.GLTF })
  .then((glTF: GLTFResource) => {
    // 获取 glTF 模型实例化的模型对象
    const root = glTF.instantiateSceneRoot();
    // 将模型对象添加到场景中
    scene.addRootEntity(root);
    // 获取插件信息
    const { extensionsData } = glTF;
    // 根据插件信息切换材质
    const variants: IGLTFExtensionVariants = extensionsData?.variants;
    if (variants) {
      const extensionData = extensionsData;
      const replaceVariant = variants[0];
      const { renderer, material } = replaceVariant;
      renderer.setMaterial(material);
    }
  });
```
