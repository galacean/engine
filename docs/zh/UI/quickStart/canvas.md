---
order: 0
title: 创建根画布
type: UI
label: UI
---

根画布是 UI 的基础，但不是所有的 `UICanvas` 都是根画布，接下来为大家演示如何在场景中创建根画布。

## 编辑器使用

### 添加 UICanvas 节点

在 **[层级面板](/docs/interface/hierarchy/)** 添加 Canvas 节点

<img src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*ZFO6Q7P7NwQAAAAAAAAAAAAAehuCAQ/original" style="zoom:50%;" />

### 设置属性

选中添加了 `Canvas` 组件的节点，可以在 **[检查器面板](/docs/interface/inspector)** 设置相关的属性

<img src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*4nbARKclT8sAAAAAAAAAAAAAehuCAQ/original" style="zoom:50%;" />

### 根画布

如果新添加的画布节点的父亲或祖先节点已经包含激活的 `UICanvas` 组件，那么此画布不包含任何渲染与交互的功能。

<img src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*9CxZQ5t6GVEAAAAAAAAAAAAAehuCAQ/original" style="zoom:50%;" />

## 属性

| 属性名                       | 描述                                                          |
| :--------------------------- | :------------------------------------------------------------ |
| `renderMode`                 | 画布的渲染模式                                                |
| `renderCamera`               | 当画布设置为 `ScreenSpaceCamera` 模式时，对应的渲染相机       |
| `distance`                   | 当画布设置为 `ScreenSpaceCamera` 模式时，画布相较于相机的距离 |
| `resolutionAdaptationMode`   | 画布的适配模式，可以按需选择宽度适配或者高度适配等模式        |
| `referenceResolution`        | 画布在做尺寸适配时，依据的设计分辨率                          |
| `referenceResolutionPerUnit` | 画布中的单位与世界空间中单位的比例关系                        |
| `sortOrder`                  | 画布的渲染排序优先级                                          |

## 脚本开发

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
