---
order: 2
title: Skinned Mesh Renderer
type: Graphics
group: Renderer
label: Graphics/Renderer
---

The Skinned Mesh Renderer inherits from the [Mesh Renderer](/en/docs/graphics/renderer/meshRenderer/), additionally encapsulating the capabilities of `skeletal animation` and `Blend Shape`, making the animation effects of rendered objects more natural and realistic.

## Properties

The properties of the Skinned Mesh Renderer are mostly related to `skeletal animation` and `Blend Shape`.

| Setting             | Description                    |
| :------------------ | :----------------------------- |
| `localBounds`       | The local bounding box of the Skinned Mesh Renderer |
| `bones`             | All bone nodes of the Skinned Mesh Renderer |
| `rootBone`          | The root bone node corresponding to the Skinned Mesh Renderer |
| `blendShapeWeights` | The blend weights of BlendShapes |

In models exported from the art workflow, all bone and BlendShape information is generally pre-set. Developers only need to play the specified animation clips in conjunction with the [animation system](/en/docs/animation/overview).

## Skeletal Animation

<playground src="skeleton-animation-play.ts"></playground>

## BlendShape

<playground src="skeleton-animation-blendShape.ts"></playground>

