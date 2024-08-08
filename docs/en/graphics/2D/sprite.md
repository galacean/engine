---
order: 1
title: Sprite
type: Graphics
group: 2D
label: Graphics/2D
---

[Sprite](/apis/core/#Sprite) is the most important asset in 2D projects. It obtains graphical source data from [Texture2D](/en/docs/graphics/texture/2d/) and customizes the desired rendering result by setting properties such as [region](/apis/core/#Sprite-region) and [pivot](/apis/core/#Sprite-pivot). If assigned to a [SpriteRenderer](/apis/core/#SpriteRenderer), the node with the sprite renderer can display 2D images in three-dimensional space. If assigned to a [SpriteMask](/en/docs/graphics/2D/spriteMask/), the node with the sprite mask can achieve masking effects for corresponding 2D elements. Next, let's delve into the properties and usage of sprites.

## Properties

| Property Name                         | Property Type                     | Description                                                                                             |
| :----------------------------------- | :-------------------------------- | :------------------------------------------------------------------------------------------------------ |
| [texture](/apis/core/#Sprite-texture) | [Texture2D](/apis/core/#Texture2D) | Reference to the texture used                                                                           |
| [width](/apis/core/#Sprite-width)     | Number                            | Width of the sprite. If the developer does not customize the sprite width, it defaults to the texture pixel width / 100 |
| [height](/apis/core/#Sprite-height)   | Number                            | Height of the sprite. If the developer does not customize the sprite height, it defaults to the texture pixel height / 100 |
| [region](/apis/core/#Sprite-region)   | [Rect](/apis/math/#Rect)           | Position of the sprite on the original texture, range 0 to 1                                            |
| [pivot](/apis/core/#Sprite-pivot)     | [Vector2](/apis/math/#Vector2)     | Position of the sprite's center point in the region on the original texture, range 0 to 1               |
| [border](/apis/core/#Sprite-border)   | [Vector4](/apis/math/#Vector4)     | When the renderer's drawing mode is nine-slice or tiled, the border configuration affects the final rendering effect. x, y, z, w correspond to the distances from the left, bottom, right, and top edges, respectively |

The region determines the display content of the sprite. You can select a rectangular area in the texture to display, and the excess part will be automatically filtered out, as shown below:

<img src="https://gw.alipayobjects.com/mdn/rms_7c464e/afts/img/A*ABvvTJnUgpsAAAAAAAAAAAAAARQnAQ" alt="avatar" style="zoom:50%;" />

The pivot represents the position of the sprite's center in the region, as shown below:

<img src="https://gw.alipayobjects.com/mdn/rms_7c464e/afts/img/A*6RyQTpqE4dMAAAAAAAAAAAAAARQnAQ" alt="avatar" style="zoom:50%;" />

## Usage

### Creation

#### Upload Sprite

In the **[Assets Panel](/en/docs/assets/interface/)**, right-click on the blank area and select **Upload** → **Sprite** → **Select the corresponding image** to upload the sprite asset. After a successful upload, the current asset list will synchronously add a texture asset named `image_name.png` and a sprite asset named `image_name-spr.png`.

<img src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*bRghQqoN1GAAAAAAAAAAAAAADhuCAQ/original" alt="avatar"  />

#### Create Blank Sprite

In the **[Assets Panel](/en/docs/assets/interface/)**, right-click on the blank area and select **Create** → **Sprite** to create a blank sprite asset.

<img src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*Gv96TrKvRkEAAAAAAAAAAAAADhuCAQ/original" alt="avatar"  />

#### Script Creation

Similarly, in the script, we can create a sprite with the following code:

```typescript
// 创建一个空白精灵
const sprite = new Sprite(engine);
// 创建一个带纹理的精灵
const spriteWithTexture = new Sprite(engine, texture2D);
```

### Set Properties

Here, we specifically explain the setting of the pivot in the editor. For the pivot, the bottom-left corner of the texture is `(0, 0)`, the X-axis goes from left to right, and the Y-axis goes from bottom to top. The editor has some built-in common pivot shortcut values, as shown below:

<img src="https://mdn.alipayobjects.com/huamei_w6ifet/afts/img/A*ZKFJR5LdJA0AAAAAAAAAAAAADjCHAQ/original" alt="avatar" style="zoom:100%;" />

If the built-in values do not meet your needs, you can customize your own pivot, as shown below:

<img src="https://mdn.alipayobjects.com/huamei_w6ifet/afts/img/A*tuZ7QJEl_wsAAAAAAAAAAAAADjCHAQ/original" alt="avatar" style="zoom:50%;" />
