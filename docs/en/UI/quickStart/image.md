---
order: 2
title: Image
type: UI
label: UI
---

The `Image` component is used to display images within a `UICanvas`.

## Editor Usage

### Add Image Node

Add an `Image` node in the **[Hierarchy Panel](/docs/interface/hierarchy/)**.

<img src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*9SCNTZNglo0AAAAAAAAAAAAAehuCAQ/original" style="zoom:50%;" />

> If the parent or ancestor node does not have a Canvas component, a root canvas node will be automatically added.

### Set Sprite

The content displayed by the `Image` depends on the selected [Sprite asset](). Select the node with the `Image` component, and in the **[Inspector Panel](/docs/interface/inspector)**, choose the corresponding sprite asset in the Sprite property to change the displayed content.

<img src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*aztPTKxnkHEAAAAAAAAAAAAAehuCAQ/original" style="zoom:50%;" />

### Modify Draw Mode

The `Image` component currently provides three draw modes: Normal, Nine-Patch, and Tiled (the default is Normal). You can visually feel the rendering differences between modes by modifying the width and height in each mode.

<img src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*z6iPRb0U9FUAAAAAAAAAAAAAehuCAQ/original" style="zoom:50%;" />

### Adjust Size

For adjusting the size of UI elements, refer to [Quickly Adjust UI Element Size](/docs/UI/quickStart/transform).

## Properties

| Property Name      | Description                                         |
| :----------------- | :-------------------------------------------------- |
| `sprite`           | The sprite to render                                |
| `color`            | The color of the sprite                             |
| `drawMode`         | The draw mode, supports Normal, Nine-Patch, and Tiled modes |
| `raycastEnabled`   | Whether the image can be detected by raycasting    |
| `raycastPadding`   | Custom padding for raycasting, representing the distance from the edges of the collision area. This is a normalized value, where X, Y, Z, and W represent the distances from the left, bottom, right, and top edges respectively. |

## Script Development

<playground src="ui-Image.ts"></playground>