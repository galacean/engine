---
order: 4
title: Loading and Using Models
type: Graphics
group: Model
label: Graphics/Model
---

Loading and using model assets generally involves the following two scenarios:

- Using models preloaded with the scene file in the script
- Loading and using models not preloaded in the script

In the editor, **models placed in the scene** will be preloaded with the scene file. Follow the steps **Assets Panel** -> **Left-click and drag the model thumbnail** -> **Drag to [Viewport](/en/docs/interface/viewport)** -> **Release the left mouse button** -> **Adjust coordinates** to place the model in the corresponding scene.

> The editor cannot directly adjust the scale property of the model node. Therefore, in most cases, you need to drag the model node under an entity node and then adjust the scale property of the entity node.

<img src="https://gw.alipayobjects.com/zos/OasisHub/8e088349-f36d-4d16-a525-bbb63fe00105/import.gif" alt="import" style="zoom:100%;" />

In this case, you only need to find the specific node in the scene at runtime to get the corresponding model object.

```typescript
// 根据节点名寻找模型节点
const model1 = scene.findEntityByName("ModelName");
// 根据节点路径寻找模型节点
const model2 = scene.findEntityByPath("ModelPath");
```

## Loading Models

As long as we have the URL information of the model, we can easily load the model.

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

In the editor, you can directly get the URL of the model asset (**[Assets Panel](/en/docs/assets/interface)** -> **Right-click the model asset thumbnail** -> **Copy file info / Copy relative path**):

<img src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*T6-QR7KrH8oAAAAAAAAAAAAADhuCAQ/original" alt="import" style="zoom: 50%;" />

For models not imported into the editor, the corresponding URL is the path where the model assets are stored.

## Loading Progress

When loading models, you can also get the loading progress of the total task/detailed task through the [onProgress](/apis/core/#AssetPromise-onProgress) event.

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

## Using Models

The loaded model object will return a root node containing rendering information and animation information. Its usage is no different from ordinary nodes.

<playground src="gltf-basic.ts"></playground>

### 1. Select Scene Root Node

glTF may contain multiple scene root nodes `sceneRoots`. Developers can manually select the root node they wish to instantiate.

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

### 2. Play Animation

If the model carries animation information, you can get the [Animator](/apis/core/#Animator) component from the root node and then choose to play any animation clip.

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

### 3. Multi-Material Switching

The glTF [multi-material extension](https://github.com/KhronosGroup/glTF/tree/master/extensions/2.0/Khronos/KHR_materials_variants) can be used to switch materials.

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
