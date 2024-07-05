---
order: 2
title: 场景
type: 核心概念
label: Core
---

Scene 作为场景单元，可以方便的进行实体树管理，尤其是大型游戏场景。如: **scene1** 和 **scene2** 作为两个不同的场景，可以各自独立管理其拥有的 **Entity** 树，因此场景下的光照组件、渲染组件和物理组件之间也互相隔离，互不影响。我们可以同时渲染一个或多个 Scene，也可以在特定时机下根据项目逻辑动态切换当前 Scene。

从结构上每个 Engine 下可以包含一个和多个激活的场景（目前编辑器还不支持多个）。每个 Scene 可以有多个根实体。

## 编辑器使用

### 创建和切换

在 **[资产面板](/docs/assets-interface)** 右键（或资产面板右上角 + 号）创建场景，双击场景可以切换过去：

![scene-switch](https://gw.alipayobjects.com/zos/OasisHub/eef870a7-2630-4f74-8c0e-478696a553b0/2024-03-19%25252018.04.02.gif)

### 属性面板

<img src="https://gw.alipayobjects.com/zos/OasisHub/4cab176f-a274-4d97-a98d-334f6bc611ac/image-20240319180602935.png" alt="image-20240319180602935" style="zoom:50%;" />

### 环境光

详情请参照[环境光教程](/docs/graphics-light-ambient) 和 [烘焙教程](/docs/graphics-light-bake)。

### 背景

详情请参照[背景教程](/docs/graphics-background)。

### 阴影

详情请参照[阴影教程](/docs/graphics-light-shadow)。

### 雾化

可以给整个场景增加 **线性、指数、指数平方** 3 种雾化：

![Fog](https://gw.alipayobjects.com/zos/OasisHub/224fbc16-e60c-47ca-845b-5f7c09563c83/2024-03-19%25252018.08.23.gif)


## 脚本使用

| 属性名称                                 | 解释     |
| :--------------------------------------- | :------- |
| [scenes](/apis/core/#SceneManager-scenes) | 场景列表 |

| 方法名称                                           | 解释     |
| :------------------------------------------------- | :------- |
| [addScene](/apis/core/#SceneManager-addScene)       | 添加场景 |
| [removeScene](/apis/core/#SceneManager-removeScene) | 移除场景 |
| [mergeScenes](/apis/core/#SceneManager-mergeScenes) | 合并场景 |
| [loadScene](/apis/core/#SceneManager-loadScene)     | 加载场景 |

### 加载场景

如果想要加载 **Scene** 资产作为应用中的一个场景，可以使用 `engine.resourceManager.load` 传入 url 即可。

```typescript
const sceneUrl = "...";

engine.resourceManager
  .load({ type: AssetType.Scene, url: "..." })
  .then((scene) => {
    engine.sceneManager.addScene(scene);
  });
```

### 获取场景对象

一个引擎实例可能包含多个场景实例，如果为了在当前激活的场景中添加一个立方体，需要通过引擎的场景管理器 `engine.sceneManager.activeScene` 获得当前激活的场景。

```typescript
const scene = engine.sceneManager.activeScene;
```

通过调用 `engine.sceneManager.scenes` 可以获取当前引擎运行时激活的全部场景，也可以通过 `entity.scene` 获取对应 `entity` 从属的 `scene`。

```typescript
// 获取当前所有激活的场景
const scenes = engine.sceneManager.scenes;

// 获取节点属于的场景
const scene = entity.scene;
```

### 添加/移除 Scene

`engine.sceneManager.scenes` 是只读的，若需要添加和移除 **Scene** ，需要调用 `engine.sceneManager.addScene()` 或 `engine.sceneManager.removeScene()` ，**引擎支持同时渲染多个场景**。

```typescript
// 假设已经有两个场景
const scene1, scene2;

// 添加 场景1
engine.sceneManager.addScene(scene1);

// 添加 场景2
engine.sceneManager.addScene(scene1);

// 移除 场景2
engine.sceneManager.removeScene(scene2);
```

多场景渲染示例如下：

<playground src="multi-scene.ts"></playground>

### 合并场景

可以使用 `engine.sceneManager.mergeScenes` 将 2 个场景进行合并为 1 个场景。

```typescript
// 假设已经有两个未激活的场景
const sourceScene, destScene;

// 将 sourceScene 合并到 destScene
engine.sceneManager.mergeScenes(sourceScene, destScene);

// 激活 destScene
engine.sceneManager.addScene(destScene);
```

### 销毁场景

调用 `scene.destroy()` 即可销毁场景，被销毁的场景也会自动从激活场景列表中移除。

### 实体树管理

| 方法名称                                              | 解释                                                                                                 |
| :---------------------------------------------------- | :--------------------------------------------------------------------------------------------------- |
| [createRootEntity](/apis/core/#Scene-createRootEntity) | 新创建的 _scene_ 默认没有根实体，需要手动创建                                                        |
| [addRootEntity](/apis/core/#Scene-addRootEntity)       | 可以直接新建实体，或者添加已经存在的实体                                                             |
| [removeRootEntity](/apis/core/#Scene-removeRootEntity) | 删除根实体                                                                                           |
| [getRootEntity](/apis/core/#Scene-getRootEntity)       | 查找根实体，可以拿到全部根实体，或者单独的某个实体对象。注意，全部实体是只读数组，不能改变长度和顺序 |

```typescript
const engine = await WebGLEngine.create({ canvas: "demo" });
const scene = engine.sceneManager.scenes[0];

// 创建根实体
const rootEntity = scene.createRootEntity();

// 添加实体到场景
scene.addRootEntity(rootEntity);

// 删除根实体
scene.removeRootEntity(rootEntity);

// 查找根实体
const allEntities: Readonly<Entity[]> = scene.rootEntities;

const entity2 = scene.getRootEntity(2);
```

### 其他

需要注意的是，当我们熟悉了 [Engine](/apis/core/#Engine) 和 [Scene](/apis/core/#Scene) 之后，如果想要将渲染画面输出到屏幕上或者进行离屏渲染，我们还得确保当前 _scene_ 的实体树上挂载了 [Camera](/apis/core/#Camera)，挂载相机的方法如下：

```typescript
const cameraEntity = rootEntity.createChild("camera");

cameraEntity.addComponent(Camera);
```
