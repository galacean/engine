---
order: 2
title: Texture
type: Graphics
group: Background
label: Graphics/Background
---

When the background type of the scene is set to texture, the rendering area of the canvas will be filled with the corresponding texture according to the fill rule before camera rendering.

## Set Texture Background

Based on the path **[Hierarchy Panel](/en/docs/interface/hierarchy)** -> **Select Scene** -> **[Inspector Panel](/en/docs/interface/inspector)** -> Set **Mode** to **Texture** in the **Background** section, then choose the desired texture. You can see the background of the scene change in real-time.

![](https://gw.alipayobjects.com/zos/OasisHub/2673b2a2-a87b-4707-b3fc-9af334231298/2024-07-18%25252017.50.16.gif)

Similarly, you can also set it in scripts using the following code:

```typescript
// 获取当前场景的背景实例
const background = scene.background;
// 设置背景类型为纹理
background.mode = BackgroundMode.Texture;
// 将一张 2D 纹理设置为背景纹理
background.texture = await engine.resourceManager.load<Texture2D>({
  url: "XXX.jpg",
  type: AssetType.Texture2D,
});
// 设置填充模式为铺满
background.textureFillMode = BackgroundTextureFillMode.Fill;
```

## Properties

It is important to note that all background-related properties are in the `background` property of the scene. Only after obtaining this property instance can you modify the related properties to take effect.

| Property         | Description                                                                                                                                                                                                                                                                           |
| :--------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| texture          | Set the background texture                                                                                                                                                                                                                                                            |
| textureFillMode  | Set the fill mode of the background texture, options are [AspectFitWidth](/apis/core/#BackgroundTextureFillMode-AspectFitWidth), [AspectFitHeight](/apis/core/#BackgroundTextureFillMode-AspectFitHeight), or [Fill](/apis/core/#BackgroundTextureFillMode-Fill), default is `BackgroundTextureFillMode.AspectFitHeight` |

### Fill Modes

Set the texture adaptation mode by `background.textureFillMode = BackgroundTextureFillMode.AspectFitWidth`.

Currently, there are three fill modes for texture adaptation:

| Fill Mode                                                                | Description                                           |
| ------------------------------------------------------------------------ | ----------------------------------------------------- |
| [AspectFitWidth](/apis/core/#BackgroundTextureFillMode-AspectFitWidth)    | Maintain aspect ratio, scale the texture width to fit the canvas width, center vertically. |
| [AspectFitHeight](/apis/core/#BackgroundTextureFillMode-AspectFitHeight)  | Maintain aspect ratio, scale the texture height to fit the canvas height, center horizontally. |
| [Fill](/apis/core/#BackgroundTextureFillMode-Fill)                        | Fill the width and height of the canvas with the texture. |

Please paste the Markdown content you need to be translated.
