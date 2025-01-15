---
order: 2
title: Scene
type: Core Concept
label: Core
---

Scene, as a scene unit, can facilitate entity tree management, especially for large game scenes. For example: **scene1** and **scene2** as two different scenes can independently manage their own **Entity** trees. Therefore, the lighting components, rendering components, and physical components under the scenes are also isolated from each other and do not affect each other. We can render one or more Scenes simultaneously, or dynamically switch the current Scene according to project logic at specific times.

Structurally, each Engine can contain one or more active scenes (currently the editor does not support multiple). Each Scene can have multiple root entities.

## Editor Usage

### Creation and Switching

Right-click in the **[Assets Panel](/en/docs/assets/interface)** (or the + sign at the top right of the assets panel) to create a scene, double-click the scene to switch to it:

![scene-switch](https://gw.alipayobjects.com/zos/OasisHub/eef870a7-2630-4f74-8c0e-478696a553b0/2024-03-19%25252018.04.02.gif)

### Properties Panel

<img src="https://gw.alipayobjects.com/zos/OasisHub/d3f073e5-dbd3-4345-a1ca-d4f3adf6000a/image-20250114194404516.png" alt="image-20240718190944508" style="zoom:50%;" />

### Ambient Light

For details, please refer to the [Ambient Light Tutorial](/en/docs/graphics/light/ambient/) and [Baking Tutorial](/en/docs/graphics/light/bake/).

### Background

For details, please refer to the [Background Tutorial](/en/docs/graphics/background/background/).

### Shadow

For details, please refer to the [Shadow Tutorial](/en/docs/graphics/light/shadow/).

### Fog

You can add **linear, exponential, exponential squared** 3 types of fog to the entire scene:

![Fog](https://gw.alipayobjects.com/zos/OasisHub/224fbc16-e60c-47ca-845b-5f7c09563c83/2024-03-19%25252018.08.23.gif)

## Script Usage

| Property Name                             | Description |
| :---------------------------------------- | :---------- |
| [scenes](/apis/core/#SceneManager-scenes) | Scene list  |

| Method Name                                         | Description  |
| :-------------------------------------------------- | :----------- |
| [addScene](/apis/core/#SceneManager-addScene)       | Add scene    |
| [removeScene](/apis/core/#SceneManager-removeScene) | Remove scene |
| [mergeScenes](/apis/core/#SceneManager-mergeScenes) | Merge scenes |
| [loadScene](/apis/core/#SceneManager-loadScene)     | Load scene   |

### Loading a Scene

If you want to load a **Scene** asset as a scene in the application, you can use `engine.resourceManager.load` and pass in the URL.

```typescript
const sceneUrl = "...";

engine.resourceManager.load({ type: AssetType.Scene, url: "..." }).then((scene) => {
  engine.sceneManager.addScene(scene);
});
```

### Getting Scene Objects

By calling `engine.sceneManager.scenes`, you can get all the scenes currently active in the engine runtime. You can also get the corresponding `scene` to which an `entity` belongs through `entity.scene`.

```typescript
// 获取当前所有激活的场景
const scenes = engine.sceneManager.scenes;

// 获取节点属于的场景
const scene = entity.scene;
```

### Adding/Removing Scene

`engine.sceneManager.scenes` is read-only. If you need to add or remove a **Scene**, you need to call `engine.sceneManager.addScene()` or `engine.sceneManager.removeScene()`. **The engine supports rendering multiple scenes simultaneously**.

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

The example of multi-scene rendering is as follows:

<playground src="multi-scene.ts"></playground>

### Merging Scenes

You can use `engine.sceneManager.mergeScenes` to merge 2 scenes into 1 scene.

```typescript
// 假设已经有两个未激活的场景
const sourceScene, destScene;

// 将 sourceScene 合并到 destScene
engine.sceneManager.mergeScenes(sourceScene, destScene);

// 激活 destScene
engine.sceneManager.addScene(destScene);
```

### Destroying Scenes

Call `scene.destroy()` to destroy a scene. The destroyed scene will also be automatically removed from the active scene list.

### Entity Tree Management

| Method Name | Description |
| :-- | :-- |
| [createRootEntity](/apis/core/#Scene-createRootEntity) | The newly created _scene_ does not have a root entity by default and needs to be created manually |
| [addRootEntity](/apis/core/#Scene-addRootEntity) | You can directly create a new entity or add an existing entity |
| [removeRootEntity](/apis/core/#Scene-removeRootEntity) | Remove the root entity |
| [getRootEntity](/apis/core/#Scene-getRootEntity) | Find the root entity, you can get all root entities or a single entity object. Note that all entities are read-only arrays and cannot change length or order |

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

### Others

It should be noted that when we are familiar with [Engine](/apis/core/#Engine) and [Scene](/apis/core/#Scene), if we want to output the rendered picture to the screen or perform off-screen rendering, we must also ensure that the entity tree of the current _scene_ has a [Camera](/apis/core/#Camera) mounted. The method to mount the camera is as follows:

```typescript
const cameraEntity = rootEntity.createChild("camera");

cameraEntity.addComponent(Camera);
```

```

```
