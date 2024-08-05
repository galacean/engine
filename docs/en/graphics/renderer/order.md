---
order: 3
title: Render Order
type: Graphics
group: Renderer
label: Graphics/Renderer
---

The render order of the renderer affects the **performance** and **accuracy** of rendering. In Galacean, for each camera, components are placed in the corresponding **render queue** according to a unified **determination rule**.

## Render Queue

Galacean is divided into three render queues, in the order of rendering:

- Opaque Render Queue (**Opaque**)
- Alpha Test Render Queue (**AlphaTest**)
- Transparent Render Queue (**Transparent**)

The queue to which the renderer is assigned is determined by whether the renderer material is **transparent** and the **alpha test threshold**.

```mermaid
flowchart TD
    A[渲染数据进入队列] --> B{是否透明}
    B -->|是| C[透明渲染队列]
    B -->|否| D{透明裁剪的阈值是否大于零}
    D -->|是| E[透明裁剪渲染队列]
    D -->|否| F[非透明渲染队列]
```

## Determination Rules

The determination rules for render order in Galacean are as follows:

```mermaid
flowchart TD
    A[渲染数据排序] --> B{渲染器优先级}
    B -->|不相等| C[返回比较结果]
    B -->|相等| D{是否来自相同渲染器}
    D -->|不相同| E{渲染器组件包围盒与相机的距离}
    D -->|相同| F[根据材质优先级返回比较结果]
    E -->|不相等| G[返回比较结果]
    E -->|想等| H[根据 ID 返回比较结果]
```

### Renderer Priority

The engine provides the `priority` property for the renderer to modify the render order in the render queue. The default value is 0. **The smaller the priority (it can be negative), the higher the rendering priority**.

### Material Priority

The engine provides the `priority` property for the material to modify the render order of different render data from the same renderer in the render queue. The default value is 0. **The smaller the priority (it can be negative), the higher the rendering priority**.

### Distance from Renderer Component Bounding Box to Camera

The calculation method of the distance from the renderer component bounding box to the camera depends on the [camera](/en/docs/graphics/camera/camera/) type. In an orthographic camera, it is the distance from the center of the renderer bounding box to the camera along the camera view direction. In a perspective camera, it is the direct distance from the center of the renderer bounding box to the camera position.

<img src="https://mdn.alipayobjects.com/huamei_w6ifet/afts/img/A*gYvyQp6qD3YAAAAAAAAAAAAADjCHAQ/original" alt="Distance to Camera Diagram" style="zoom:50%;" />

> It should be noted that in different render queues, the rules for the impact of distance on render order are different. In the opaque render queue and alpha test render queue, the render order is **from near to far**, while in the transparent render queue, the render order is **from far to near**.

### Stability

Currently, when different renderers have the same `renderer priority` and the same `distance from the renderer component bounding box to the camera`, Galacean ensures the stability of the render order through **`renderer.instanceId`**, but the render order within the **same renderer** cannot be guaranteed to be stable.
