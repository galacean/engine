---
order: 3
title: Rendering Order
type: Graphics
group: Renderer
label: Graphics/Renderer
---

The rendering order of the renderer will affect the **performance** and **accuracy** of the rendering. In Galacean, for each camera, components are placed in the corresponding **render queue** according to a unified **determination rule**.

## Render Queue

Galacean has divided the rendering into three render queues, in the following order:

- Non-transparent render queue (**Opaque**)
- Transparent cutout render queue (**AlphaTest**)
- Transparent render queue (**Transparent**)

The assignment of the renderer to a queue is determined by whether the renderer material is **transparent** and the **threshold** of transparent cutout.

```mermaid
flowchart TD
    A[渲染数据进入队列] --> B{是否透明}
    B -->|是| C[透明渲染队列]
    B -->|否| D{透明裁剪的阈值是否大于零}
    D -->|是| E[透明裁剪渲染队列]
    D -->|否| F[非透明渲染队列]
```

## Determination Rule

The determination rule for rendering order in Galacean is as follows:

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

The engine provides a `priority` property for the renderer to modify the rendering order in the render queue. The default value is 0, the **smaller the priority (can be negative), the higher the priority** of rendering.

### Material Priority

The engine provides a `priority` property for the material to modify the rendering order of different rendering data from the same renderer in the render queue. The default value is 0, the **smaller the priority (can be negative), the higher the priority** of rendering.

### Distance from Renderer Component Bounds to Camera

The calculation of the distance from the renderer component bounds to the camera depends on the type of [camera](/en/docs/graphics-camera). In an orthographic camera, it is the distance between the center point of the renderer bounds and the camera along the camera's view direction. In a perspective camera, it is the direct distance from the center point of the renderer bounds to the camera position.

<img src="https://mdn.alipayobjects.com/huamei_w6ifet/afts/img/A*gYvyQp6qD3YAAAAAAAAAAAAADjCHAQ/original" alt="Distance to Camera Illustration" style="zoom:50%;" />

> It is important to note that the impact of distance on rendering order is different in different render queues. In the non-transparent render queue and transparent cutout render queue, the rendering order is **from near to far**, while in the transparent render queue, the rendering order is **from far to near**.

### Stability

Currently, when different renderers have the same `renderer priority` and `distance from renderer component bounds to camera`, Galacean ensures the stability of rendering order through **`renderer.instanceId`**, but it cannot guarantee the stability of rendering order within the **same renderer**.
