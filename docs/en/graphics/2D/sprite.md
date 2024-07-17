---
order: 1
title: Sprite
type: Graphics
group: 2D
label: Graphics/2D
---

[Sprite](/apis/core/#Sprite) is the most important asset in 2D projects. It retrieves graphic data from [Texture2D](/en/docs/graphics-texture-2d) and customizes the desired rendering result by setting properties such as [region](/apis/core/#Sprite-region) and [pivot](/apis/core/#Sprite-pivot). When assigned to a [SpriteRenderer](/apis/core/#SpriteRenderer), a node with a sprite renderer can display 2D images in a 3D space. When assigned to a [SpriteMask](/en/docs/graphics-2d-spriteMask), a node with a sprite mask can achieve masking effects on corresponding 2D elements. Let's delve deeper into the properties and usage of sprites.

## Properties

| Property                              | Type                              | Description                                                                                             |
| :------------------------------------ | :-------------------------------- | :------------------------------------------------------------------------------------------------------ |
| [texture](/apis/core/#Sprite-texture)  | [Texture2D](/apis/core/#Texture2D) | Reference to the texture                                                                               |
| [width](/apis/core/#Sprite-width)      | Number                            | The width of the sprite. If the developer does not customize the sprite width, it defaults to texture pixel width / 100 |
| [height](/apis/core/#Sprite-height)    | Number                            | The height of the sprite. If the developer does not customize the sprite height, it defaults to texture pixel height / 100 |
| [region](/apis/core/#Sprite-region)    | [Rect](/apis/math/#Rect)           | The position of the sprite on the original texture, ranging from 0 to 1                                   |
| [pivot](/apis/core/#Sprite-pivot)      | [Vector2](/apis/math/#Vector2)     | The position of the sprite's center in the region on the original texture, ranging from 0 to 1           |
| [border](/apis/core/#Sprite-border)    | [Vector4](/apis/math/#Vector4)     | When the renderer's drawing mode is nine-slice or tiling, the border configuration affects the final rendering result. x, y, z, w correspond to the distances from the left, bottom, right, and top edges respectively |

The region determines the content displayed by the sprite, allowing you to select a rectangular area in the texture for display, with any excess automatically filtered out, as shown below:

<img src="https://gw.alipayobjects.com/mdn/rms_7c464e/afts/img/A*ABvvTJnUgpsAAAAAAAAAAAAAARQnAQ" alt="avatar" style="zoom:50%;" />

The pivot represents the position of the sprite's center in the region, as shown below:

<img src="https://gw.alipayobjects.com/mdn/rms_7c464e/afts/img/A*6RyQTpqE4dMAAAAAAAAAAAAAARQnAQ" alt="avatar" style="zoom:50%;" />

## Usage

### Creation

#### Upload Sprite

To upload a sprite asset, right-click on a blank space in the **[Assets Panel](/en/docs/assets-interface)**, then select **Upload** → **Sprite** → **Choose the corresponding image**. This will upload the sprite asset successfully, and the current asset list will synchronize with a texture asset named `image_name.png` and a sprite asset named `image_name-spr.png`.

<img src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*bRghQqoN1GAAAAAAAAAAAAAADhuCAQ/original" alt="avatar" />

#### Create Blank Sprite

To create a blank sprite asset, right-click on a blank space in the **[Assets Panel](/en/docs/assets-interface)**, then select **Create** → **Sprite**.

<img src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*Gv96TrKvRkEAAAAAAAAAAAAADhuCAQ/original" alt="avatar" />

#### Script Creation

Similarly, in scripts, we can create a sprite using the following code:

```typescript
// 创建一个空白精灵
const sprite = new Sprite(engine);
// 创建一个带纹理的精灵
const spriteWithTexture = new Sprite(engine, texture2D);
```

### Setting Properties

Here, we specifically explain the setting of the pivot in the editor. For the pivot, the bottom-left corner of the texture is `(0, 0)`, with the X-axis from left to right and the Y-axis from bottom to top. The editor provides some commonly used pivot shortcut values, as follows:

<img src="https://mdn.alipayobjects.com/huamei_w6ifet/afts/img/A*ZKFJR5LdJA0AAAAAAAAAAAAADjCHAQ/original" alt="avatar" style="zoom:100%;" />

If the built-in values do not meet the requirements, you can customize your own pivot, as shown below:

<img src="https://mdn.alipayobjects.com/huamei_w6ifet/afts/img/A*tuZ7QJEl_wsAAAAAAAAAAAAADjCHAQ/original" alt="avatar" style="zoom:50%;" />
