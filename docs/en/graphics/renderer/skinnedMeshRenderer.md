---
order: 2
title: Skinned Mesh Renderer
type: Graphics
group: Renderer
label: Graphics/Renderer
---

The Skinned Mesh Renderer inherits from the [Mesh Renderer](/en/docs/graphics-renderer-meshRenderer) and provides additional capabilities for `skeletal animation` and `Blend Shapes`, making the animation effects of rendered objects more natural and realistic.

## Properties

The properties of the Skinned Mesh Renderer are closely related to `skeletal animation` and `Blend Shapes`.

| Setting             | Description                    |
| :------------------ | :----------------------------- |
| `localBounds`       | The local bounding box of the Skinned Mesh Renderer |
| `bones`             | All bone nodes of the Skinned Mesh Renderer |
| `rootBone`          | The root bone node corresponding to the Skinned Mesh Renderer |
| `blendShapeWeights` | The blend weights of BlendShapes |

Models exported from the art workflow generally already have all the bone and BlendShape information set up. Developers only need to combine with the [animation system](/en/docs/animation-overview) to play specific animation clips.

## Skeletal Animation

<playground src="skeleton-animation-play.ts"></playground>

## BlendShape

<playground src="skeleton-animation-blendShape.ts"></playground>

