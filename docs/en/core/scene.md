---
order: 2
title: Scene
type: Core Concepts
label: Core
---

As a unit of scene, Scene can easily manage entity trees, especially in large game scenes. For example, **scene1** and **scene2** are two different scenes that can independently manage their own **Entity** trees. Therefore, the lighting components, rendering components, and physics components under the scene are also isolated from each other and do not affect each other. We can render one or more Scenes at the same time, and dynamically switch the current Scene based on project logic at specific times.

Structurally, each Engine can contain one or more active scenes (the editor currently does not support multiple scenes). Each Scene can have multiple root entities.

## Editor Usage

### Creation and Switching

Right-click in the **[Asset Panel](/en/docs/assets-interface)** (or click the + icon in the upper right corner of the asset panel) to create a scene. Double-click on a scene to switch to it:

![scene-switch](https://gw.alipayobjects.com/zos/OasisHub/eef870a7-2630-4f74-8c0e-478696a553b0/2024-03-19%25252018.04.02.gif)

### Property Panel

<img src="https://gw.alipayobjects.com/zos/OasisHub/4cab176f-a274-4d97-a98d-334f6bc611ac/image-20240319180602935.png" alt="image-20240319180602935" style="zoom:50%;" />

### Ambient Light

For more details, please refer to the [Ambient Light Tutorial](/en/docs/graphics-light-ambient) and [Baking Tutorial](/en/docs/graphics-light-bake).

### Background

For more details, please refer to the [Background Tutorial](/en/docs/graphics-background).

### Shadows

For more details, please refer to the [Shadows Tutorial](/en/docs/graphics-light-shadow).

### Fog

You can add **linear, exponential, and exponential squared** fog to the entire scene:

![Fog](https://gw.alipayobjects.com/zos/OasisHub/224fbc16-e60c-47ca-845b-5f7c09563c83/2024-03-19%25252018.08.23.gif)

## Script Usage

| Property Name                                     | Description |
| :------------------------------------------------ | :---------- |
| [scenes](/apis/core/#SceneManager-scenes)           | List of scenes |

| Method Name                                       | Description |
| :------------------------------------------------ | :---------- |
| [addScene](/apis/core/#SceneManager-addScene)       | Add a scene |
| [removeScene](/apis/core/#SceneManager-removeScene) | Remove a scene |
| [mergeScenes](/apis/core/#SceneManager-mergeScenes) | Merge scenes |
| [loadScene](/apis/core/#SceneManager-loadScene)     | Load a scene |

### Loading a Scene

To load a **Scene** asset as a scene in the application, you can use `engine.resourceManager.load` and pass in the URL.

```typescript
const sceneUrl = "...";

engine.resourceManager
  .load({ type: AssetType.Scene, url: "..." })
  .then((scene) => {
    engine.sceneManager.addScene(scene);
  });
```

### Getting Scene Objects

By calling `engine.sceneManager.scenes`, you can get all the scenes currently active in the engine runtime. You can also use `entity.scene` to get the `scene` to which the corresponding `entity` belongs.

```typescript
// 获取当前所有激活的场景
const scenes = engine.sceneManager.scenes;

// 获取节点属于的场景
const scene = entity.scene;
```

### Adding/Removing Scenes

`engine.sceneManager.scenes` is read-only. If you need to add or remove **Scenes**, you need to call `engine.sceneManager.addScene()` or `engine.sceneManager.removeScene()`. **The engine supports rendering multiple scenes simultaneously**.

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

Rendering in multiple scenarios is shown below:

<playground src="multi-scene.ts"></playground>

### Merge Scenes

You can use `engine.sceneManager.mergeScenes` to merge two scenes into one scene.

```typescript
// 假设已经有两个未激活的场景
const sourceScene, destScene;

// 将 sourceScene 合并到 destScene
engine.sceneManager.mergeScenes(sourceScene, destScene);

// 激活 destScene
engine.sceneManager.addScene(destScene);
```

### Destroy Scene

Call `scene.destroy()` to destroy the scene. The destroyed scene will also be automatically removed from the active scene list.

### Entity Tree Management

| Method Name                                              | Explanation                                                                                          |
| :------------------------------------------------------- | :--------------------------------------------------------------------------------------------------- |
| [createRootEntity](/apis/core/#Scene-createRootEntity)    | By default, a newly created _scene_ does not have a root entity and needs to be created manually     |
| [addRootEntity](/apis/core/#Scene-addRootEntity)          | You can create a new entity directly or add an existing entity                                       |
| [removeRootEntity](/apis/core/#Scene-removeRootEntity)    | Remove the root entity                                                                               |
| [getRootEntity](/apis/core/#Scene-getRootEntity)          | Find the root entity, you can get all root entities or a single entity object. Note that all entities are read-only arrays and cannot change length or order |

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

It is important to note that after becoming familiar with [Engine](/apis/core/#Engine) and [Scene](/apis/core/#Scene), if you want to output the rendering to the screen or perform off-screen rendering, you must ensure that a [Camera](/apis/core/#Camera) is attached to the entity tree of the current _scene_. The method to attach a camera is as follows:

```typescript
const cameraEntity = rootEntity.createChild("camera");

cameraEntity.addComponent(Camera);
```
