---
order: 0
title: 渲染器总览
type: 图形
group: 渲染器
label: Graphics/Renderer
---

渲染器是负责显示图形的[**组件**](/docs/core/component)，他会依据不同的数据源展示对应的渲染效果。通过在节点上挂载渲染器，并设置对应的渲染数据，可以展现出各种复杂的三维场景。

## 渲染器类型

在 Galacean 中，内置了以下几种渲染器：

- [网格渲染器](/docs/graphics/renderer/meshRenderer/): 通过设置 `mesh` 与 `material` 即可渲染物体。
- [蒙皮网格渲染器](/docs/graphics/renderer/skinnedMeshRenderer): 基于[网格渲染器](/docs/graphics/renderer/meshRenderer/)，额外包含了`骨骼动画`与 `Blend Shape` 的能力，使得物体的动画效果更加自然。
- [精灵渲染器](/docs/graphics/2D/spriteRenderer/): 通过设置 `sprite` 与 `material` (默认内置精灵材质)，可以在场景中展示 2D 图像。
- [精灵遮罩渲染器](/docs/graphics/2D/spriteMask/): 用于对精灵渲染器实现遮罩效果。
- [文字渲染器](/docs/graphics/2D/text/): 在场景中显示文本
- [粒子渲染器](/docs/graphics/particle/renderer/): 在场景中展示粒子效果。

通过[渲染排序](/docs/graphics/renderer/order/)可以更深入地了解各种渲染器在引擎内的渲染顺序。

## 属性

`Renderer` 在 Galacean 中是所有渲染器的基类，他包含了如下属性：

| 属性             | 解释                                               |
| :--------------- | :------------------------------------------------- |
| `receiveShadows` | 是否接收阴影                                       |
| `castShadows`    | 是否投射阴影                                       |
| `priority`       | 渲染器的渲染优先级，值越小渲染优先级越高，默认为 0 |
| `shaderData`     | 渲染依赖的数据，包含一些常量和宏开关               |
| `materialCount`  | 渲染器包含的材质总数                               |
| `bounds`         | 渲染器世界包围盒                                   |
| `isCulled`       | 渲染器在当前帧是否渲染                             |

您可以从任意派生自 `Renderer` 的渲染器内获取到这些属性。

```typescript
const renderer = cubeEntity.getComponent(Renderer);
renderer.castShadows = true;
renderer.receiveShadows = true;
renderer.priority = 1;
console.log("shaderData", renderer.shaderData);
console.log("materialCount", renderer.materialCount);
console.log("bounds", renderer.bounds);
console.log("isCulled", renderer.isCulled);
```

下方展示如何获取多个 `Renderer` 的整体包围盒：

<playground src="bounding-box.ts"></playground>

## 方法

`Renderer` 渲染器基类主要提供设置与获取材质相关的方法，需要注意的是，一个渲染器内可能包含多个材质，因此下列方法更像是在**操作材质数组的增删改查**。

| 方法                   | 解释                     |
| :--------------------- | :----------------------- |
| `setMaterial`          | 设置数组中某个材质       |
| `getMaterial`          | 获取数组中某个材质       |
| `getMaterials`         | 获取材质数组             |
| `getInstanceMaterial`  | 获取数组中某个材质的副本 |
| `getInstanceMaterials` | 获取材质数组的副本       |
