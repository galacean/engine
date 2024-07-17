---
order: 3
title: Sprite Mask
type: Graphics
group: 2D
label: Graphics/2D
---

The Sprite Mask component is used to achieve masking effects on [sprites](/en/docs/graphics-2d-spriteRenderer) and [text](/en/docs/graphics-2d-text) in 3D/2D scenes.

<playground src="sprite-mask.ts"></playground>

Control the effect on [sprites](/en/docs/graphics-2d-sprite}) by the parameters provided by [SpriteMask](/apis/core/#SpriteMask).

| Parameter        | Type   | Description                                                                                      |
| :--------------- | :----- | :----------------------------------------------------------------------------------------------- |
| influenceLayers  | number | The mask currently affects the masking layers, with a default value of SpriteMaskLayer.Everything, indicating that it affects all masking layers |
| alphaCutoff      | number | The lower limit of the effective alpha value of the current mask (range: 0~1), meaning that alpha values in the sprite's texture less than alphaCutoff will be discarded |

[SpriteMaskLayer](/apis/core/#SpriteMaskLayer) declares the masking layers provided by the engine, with a total of 32 layers declared as Layer0~Layer31. Masking layers are unrelated to rendering; they are only used to help developers associate `SpriteMask` and `SpriteRenderer`. One prerequisite for a `SpriteMask` object to mask a `SpriteRenderer` object is that the masking layers of the two intersect.

The `influenceLayers` of `SpriteMask` indicates which `SpriteRenderer` within the mask layers will be masked, and the `maskLayer` of `SpriteRenderer` indicates which masking layers the sprite is in, as shown below:

<img src="https://gw.alipayobjects.com/zos/OasisHub/09abdf57-84b8-4aa9-b785-822f858fb4f9/070C8B9F-14E2-4A9A-BFEC-4BC3F2BB564F.png" alt="070C8B9F-14E2-4A9A-BFEC-4BC3F2BB564F" style="zoom: 67%;" />

In the above image, the spriteMask affects sprites in `Layer1` and `Layer30`, spriteRenderer0 is in `Layer2` with no intersection, so it is not affected by spriteMask. spriteRenderer1 is in `Layer1`, intersecting with the masking layers affected by spriteMask, so spriteRenderer1 is affected by spriteMask.

## Usage

### Adding the Sprite Mask Component

When we need to mask a sprite, we first need to create an entity and add the Sprite Mask component, as shown below:

![mask-create](https://mdn.alipayobjects.com/huamei_w6ifet/afts/img/A*GYVBTbTvqU4AAAAAAAAAAAAADjCHAQ/original)

### Setting the Mask Area

The Sprite Mask component represents the mask area using an image. Here, we set the sprite resource through the component's `sprite` parameter, as shown below:

![mask-sprite](https://mdn.alipayobjects.com/huamei_w6ifet/afts/img/A*k5GsSYqQTKoAAAAAAAAAAAAADjCHAQ/original)

### Setting the Sprite's Mask Type

After the above two steps, you may notice that the mask still has no effect. This is because the current sprite's mask type is still the default (None). We set the `mask interaction` of the sprite in the scene to the inner mask type, as shown below:

![mask-interaction](https://mdn.alipayobjects.com/huamei_w6ifet/afts/img/A*GdxhSYLY4EIAAAAAAAAAAAAADjCHAQ/original)

### Set alpha cutoff

This parameter represents the lower limit of the current mask's valid `alpha` value (range: `0~1`), which means that alpha values in the sprite's texture that are less than the alpha cutoff will be discarded (i.e., not treated as the masking area). We can adjust the value of this property dynamically to see the actual effect, as shown below:

![mask-alpha](https://mdn.alipayobjects.com/huamei_w6ifet/afts/img/A*2CLjT7UTVa8AAAAAAAAAAAAADjCHAQ/original)

Similarly, in the script, we can use the following code to apply sprite masking:

```typescript
// Create a mask entity.
const spriteEntity = rootEntity.createChild(`spriteMask`);
// Add a SpriteMask component to the entity.
const spriteMask = spriteEntity.addComponent(SpriteMask);
// Creating a sprite object from a texture.
const sprite = new Sprite(engine, texture);
// Set sprite.
spriteMask.sprite = sprite;
// Textures in the mask's sprite with an alpha value less than 0.5 will be discarded.
spriteMask.alphaCutoff = 0.5;
// Mask is effective for all sprites in the mask layer.
spriteMask.influenceLayers = SpriteMaskLayer.Everything;
// Mask is only valid for sprites in the mask layer Layer0.
spriteMask.influenceLayers = SpriteMaskLayer.Layer0;
// Mask is valid for sprites in mask layers Layer0 and Layer1.
spriteMask.influenceLayers = SpriteMaskLayer.Layer0 | SpriteMaskLayer.Layer1;

// Set the mask interaction
spriteRenderer.maskInteraction = SpriteMaskInteraction.VisibleInsideMask;
// Set which mask layer the sprite is in.
spriteRenderer.maskLayer = SpriteMaskLayer.Layer0;
```
