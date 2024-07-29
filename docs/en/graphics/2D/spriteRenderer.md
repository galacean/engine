---
order: 2
title: Sprite Renderer
type: Graphics
group: 2D
label: Graphics/2D
---

The [SpriteRenderer](/apis/core/#SpriteRenderer) component is used to display images in 3D/2D scenes.

> Note: By default, the sprite renderer places the image on the XoY plane.

<img src="https://gw.alipayobjects.com/mdn/rms_7c464e/afts/img/A*_5fjTp0r2KEAAAAAAAAAAAAAARQnAQ" alt="avatar" style="zoom:50%;" />

## Properties

![Properties Panel](https://mdn.alipayobjects.com/huamei_w6ifet/afts/img/A*pcbLSahH--YAAAAAAAAAAAAADjCHAQ/original)

| Property                                                     | Type                                                      | Description                                                                                      |
| :----------------------------------------------------------- | :-------------------------------------------------------- | :------------------------------------------------------------------------------------------------ |
| [sprite](/apis/core/#SpriteRenderer-sprite)                   | [Sprite](/apis/core/#Sprite)                               | Reference to the sprite                                                                          |
| [width](/apis/core/#SpriteRenderer-width)                     | Number                                                    | Width of the sprite renderer; if not customized by the developer, defaults to the sprite width   |
| [height](/apis/core/#SpriteRenderer-height)                   | Number                                                    | Height of the sprite renderer; if not customized by the developer, defaults to the sprite height |
| [color](/apis/core/#SpriteRenderer-color)                     | [Color](/apis/math/#Color)                                 | Color of the sprite                                                                              |
| [flipX](/apis/core/#SpriteRenderer-flipX)                     | Boolean                                                   | Whether to flip on the X-axis when rendering                                                     |
| [flipY](/apis/core/#SpriteRenderer-flipY)                     | Boolean                                                   | Whether to flip on the Y-axis when rendering                                                     |
| [drawMode](/apis/core/#SpriteRenderer-drawMode)               | [SpriteDrawMode](/apis/core/#SpriteDrawMode)               | Drawing mode, supports normal, nine-slice, and tiling drawing modes                              |
| [maskInteraction](/apis/core/#SpriteRenderer-maskInteraction) | [SpriteMaskInteraction](/apis/core/#SpriteMaskInteraction) | Mask interaction type, used to set whether the sprite needs a mask, and if so, whether to display inside or outside the mask |
| [maskLayer](/apis/core/#SpriteRenderer-maskLayer)             | [SpriteMaskLayer](/apis/core/#SpriteMaskLayer)             | Mask layer to which the sprite belongs, used for matching with SpriteMask, defaults to Everything, indicating it can be masked with any SpriteMask |

## Usage

### Creation

#### Create a Node with Sprite Renderer

By selecting a node in the **[Hierarchy Panel](/en/docs/interface/hierarchy)**, you can quickly add a child node with a sprite renderer by right-clicking -> **2D Object** -> **Sprite Renderer**.

<img src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*fiA8R5ZwXyUAAAAAAAAAAAAADhuCAQ/original" alt="avatar" style="zoom:50%;" />

#### Attach Sprite Renderer to a Node

To attach a sprite renderer to an existing node, simply go to the **[Inspector Panel](/en/docs/interface/inspector)** of the selected node, then choose **Add Component** -> **2D** -> **Sprite Renderer**.

<img src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*UnDbQZHMOCcAAAAAAAAAAAAADhuCAQ/original" alt="avatar" style="zoom:50%;" />

#### Script Creation

Similarly, in scripts, we can attach a sprite renderer to a node with the following code:

```typescript
const spriteRenderer = entity.addComponent(SpriteRenderer);
spriteRenderer.sprite = sprite;
```

### Set Sprite

When displaying an image, first add a sprite component to an entity and then set the sprite asset as follows:

<img src="https://mdn.alipayobjects.com/huamei_w6ifet/afts/img/A*adizTpp_l5cAAAAAAAAAAAAADjCHAQ/original" alt="avatar"  />

### Rendering Size

Setting the `width` and `height` of `SpriteRenderer` can explicitly specify the size of the sprite in 3D space. If not set, the size of the `Sprite` will be used as the default value.

<playground src="sprite-size.ts"></playground>

### Set Color

Adjust the color by setting the `color` property to achieve fade-in and fade-out effects, as shown below:

<img src="https://mdn.alipayobjects.com/huamei_w6ifet/afts/img/A*5pRRSLLGfq8AAAAAAAAAAAAADjCHAQ/original" alt="avatar"  />

### Image Flip

In addition to basic image display, `SpriteRenderer` also supports image flipping. Simply set the `flipX/flipY` properties to achieve flipping, as shown below:

<img src="https://mdn.alipayobjects.com/huamei_w6ifet/afts/img/A*sK6tTJELnP0AAAAAAAAAAAAADjCHAQ/original" alt="avatar"  />

<playground src="sprite-flip.ts"></playground>

### Drawing Modes

The sprite renderer currently provides three drawing modes: normal, nine-slice, and tiled drawing (default is normal drawing). By modifying the drawing width and height in different drawing modes, you can visually perceive the rendering differences between the modes, as shown below:

<playground src="sprite-drawMode.ts"></playground>

### Masking

Please refer to the [Sprite Mask](/en/docs/graphics-2d-spriteMask) documentation.

## Custom Materials

Please refer to the [Custom Shader](/en/docs/graphics-shader-custom) documentation.

<playground src="sprite-material-blur.ts"></playground>

