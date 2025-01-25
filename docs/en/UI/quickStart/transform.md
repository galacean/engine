---
order: 1
title: UITransform
type: UI
label: UI
---

The `UITransform` component is specifically designed to represent the size and position of UI elements. It inherits from the [Transform](/apis/core/#Transform) component.

## Editor Usage

When a node with a UI component is added, the `UITransform` component will automatically be added (replacing the previous [Transform](/apis/core/#Transform) component). In the editor, you can select the node and use the `RectTool` (shortcut key `T`) to quickly adjust properties, or you can set precise properties in the **[Inspector Panel](/docs/interface/inspector)**.

<img src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*hJ81TKtDKLIAAAAAAAAAAAAAehuCAQ/original" style="zoom:50%;" />

> When the main canvas's render mode is `Screen`, the editor will prohibit modifications to its `transform` to avoid screen adaptation issues. Therefore, in scripts, **developers should avoid modifying the `transform` properties of the main canvas in screen space.**

## Properties

| Property Name | Description                                                                 |
| :------------ | :--------------------------------------------------------------------------- |
| `size`        | The size of the UI element. `x` represents width, and `y` represents height. The default is `100` for both. |
| `pivot`       | The anchor point of the UI element. It is a normalized 2D vector with the origin at the bottom-left corner, with the default value being the center (0.5, 0.5). |

## Script Usage

```typescript
// Add UICanvas
const canvasEntity = root.createChild("canvas");
const canvas = canvasEntity.addComponent(UICanvas);
const imageEntity = canvasEntity.create("Image");
(<UITransform>imageEntity.transform).size.set(200, 200);
(<UITransform>imageEntity.transform).pivot.set(0, 0);
```