---
order: 1
title: Solid Color
type: Graphics
group: Background
label: Graphics/Background
---

When the background type of the scene is set to Solid Color, the rendering area of the canvas will be filled with the corresponding solid color background before camera rendering.

## Set Solid Color Background

Navigate to **[Hierarchy Panel](/en/docs/interface/hierarchy)** -> **Select Scene** -> **[Inspector Panel](/en/docs/interface/inspector)** -> **Background section** and set **Mode** to **Solid Color**. Then choose the desired background color, and you will see the background of the scene change in real-time.

![image.png](https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*RDQ-T5h7YdEAAAAAAAAAAAAADhuCAQ/original)

Similarly, you can also set this in scripts using the following code:

```typescript
// 获取当前场景的背景实例
const background = scene.background;
// 设置背景类型为纯色
background.mode = BackgroundMode.SolidColor;
// 设置特定的背景色
background.solidColor.set(0.25, 0.25, 0.25, 1.0);
// 设置为(0,0,0,0) 可以透出网页背景
background.solidColor.set(0, 0, 0, 0);
```

## Properties

It is important to note that all background-related properties are within the scene's `background` property. You need to modify these properties after obtaining the instance of this property for the changes to take effect.

| Property    | Description  |
| :---------- | :----------- |
| solidColor  | Set the background color |

