---
order: 2
title: Texture
type: Graphics
group: Background
label: Graphics/Background
---

When the background type of the scene is set to texture, the rendering area of the canvas will be filled with the corresponding texture according to the fill rules before the camera renders.

## Setting Texture Background

According to the path **[Hierarchy Panel](/en/docs/interface/hierarchy)** -> **Select Scene** -> **[Inspector Panel](/en/docs/interface/inspector)** -> **Background Section** set **Mode** to **Texture**, then select the desired texture, you can see the background of the scene change in real-time.

![](https://gw.alipayobjects.com/zos/OasisHub/2673b2a2-a87b-4707-b3fc-9af334231298/2024-07-18%25252017.50.16.gif)

Similarly, in the script, you can also set it with the following code:

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

It should be noted that the relevant properties of the background are all in the `background` property of the scene. After obtaining this property instance, modifying the relevant properties will take effect.

| Property        | Function                                                                                                                                                                                                                                                                               |
| :-------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| texture         | Set the background texture                                                                                                                                                                                                                                                              |
| textureFillMode | Set the fill mode of the background texture, optional [AspectFitWidth](/apis/core/#BackgroundTextureFillMode-AspectFitWidth), [AspectFitHeight](/apis/core/#BackgroundTextureFillMode-AspectFitHeight) or [Fill](/apis/core/#BackgroundTextureFillMode-Fill), default is `BackgroundTextureFillMode.AspectFitHeight` |

### Fill Mode

Set the texture adaptation mode through `background.textureFillMode = BackgroundTextureFillMode.AspectFitWidth`.

Currently, there are three texture adaptation modes:

| Fill Mode                                                               | Description                                        |
| ----------------------------------------------------------------------- | -------------------------------------------------- |
| [AspectFitWidth](/apis/core/#BackgroundTextureFillMode-AspectFitWidth)   | Maintain aspect ratio, scale the texture width to the width of the Canvas, centered vertically. |
| [AspectFitHeight](/apis/core/#BackgroundTextureFillMode-AspectFitHeight) | Maintain aspect ratio, scale the texture height to the height of the Canvas, centered horizontally. |
| [Fill](/apis/core/#BackgroundTextureFillMode-Fill)                       | Fill the width and height of the Canvas with the texture.                   |

It seems like your message is empty. Please paste the Markdown content you want translated, and I'll help you with the translation while adhering to the rules you've provided.
