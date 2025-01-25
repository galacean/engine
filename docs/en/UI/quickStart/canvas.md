---
order: 0
title: Canvas
type: UI
label: UI
---

The root canvas is the foundation of the UI, but not all `UICanvas` nodes are root canvases. Here’s how to create a root canvas in your scene.

## Editor Usage

### Add UICanvas Node

Add a Canvas node in the **[Hierarchy Panel](/docs/interface/hierarchy/)**.

<img src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*ZFO6Q7P7NwQAAAAAAAAAAAAAehuCAQ/original" style="zoom:50%;" />

### Set Properties

Select the node that has the `Canvas` component and you can set its properties in the **[Inspector Panel](/docs/interface/inspector)**.

<img src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*4nbARKclT8sAAAAAAAAAAAAAehuCAQ/original" style="zoom:50%;" />

### Root Canvas

If the parent or ancestor node of the newly added canvas node already contains an active `UICanvas` component, this canvas will not have rendering or interaction functionality.

<img src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*9CxZQ5t6GVEAAAAAAAAAAAAAehuCAQ/original" style="zoom:50%;" />

## Properties

| Property Name                  | Description                                                   |
| :------------------------------ | :------------------------------------------------------------ |
| `renderMode`                    | The rendering mode of the canvas                               |
| `renderCamera`                  | The camera used for rendering when the canvas is in `ScreenSpaceCamera` mode |
| `distance`                      | The distance of the canvas relative to the camera when in `ScreenSpaceCamera` mode |
| `resolutionAdaptationMode`      | The adaptation mode of the canvas, such as width adaptation or height adaptation |
| `referenceResolution`           | The reference resolution for size adaptation of the canvas    |
| `referenceResolutionPerUnit`    | The ratio of canvas units to world space units                 |
| `sortOrder`                     | The rendering priority of the canvas                           |

## Script Development

```typescript
// Add camera
const cameraEntity = root.createChild("Camera");
const camera = cameraEntity.addComponent(Camera);

// Add UICanvas
const canvasEntity = root.createChild("canvas");
const canvas = canvasEntity.addComponent(UICanvas);

// Set renderMode to `ScreenSpaceOverlay`
canvas.renderMode = CanvasRenderMode.ScreenSpaceOverlay;
// Set renderMode to `ScreenSpaceCamera`
canvas.renderMode = CanvasRenderMode.ScreenSpaceCamera;
canvas.renderCamera = camera;
// Set Reference Resolution
canvas.referenceResolution.set(750, 1624);
// Set Adaptation Mode
canvas.resolutionAdaptationMode = ResolutionAdaptationMode.WidthAdaptation;
```