---
order: 0
title: Renderer Overview
type: Graphics
group: Renderer
label: Graphics/Renderer
---

The renderer is responsible for displaying graphics [**components**](/en/docs/core/component), which will display corresponding rendering effects based on different data sources. By attaching a renderer to a node and setting the corresponding rendering data, various complex 3D scenes can be displayed.

## Renderer Types

In Galacean, the following built-in renderers are available:

- [Mesh Renderer](graphics-renderer-meshRenderer): Renders objects by setting `mesh` and `material`.
- [Skinned Mesh Renderer](graphics-renderer-skinnedMeshRenderer): Based on the [Mesh Renderer](graphics-renderer-meshRenderer), it includes additional capabilities for `skeletal animation` and `Blend Shape`, making object animations more natural.
- [Sprite Renderer](/en/docs/graphics-2d-spriteRenderer): Displays 2D images in the scene by setting `sprite` and `material` (default built-in sprite material).
- [Sprite Mask Renderer](/en/docs/graphics-2d-spriteMask): Used to implement masking effects on sprite renderers.
- [Text Renderer](/en/docs/graphics-2d-text): Displays text in the scene.
- [Particle Renderer](/en/docs/graphics-particle-renderer): Displays particle effects in the scene.

Further understanding of the rendering order of various renderers in the engine can be achieved through [render sorting](/en/docs/graphics-renderer-order).

## Properties

`Renderer` is the base class for all renderers in Galacean and includes the following properties:

| Property          | Description                                         |
| :---------------- | :-------------------------------------------------- |
| `receiveShadows`  | Whether to receive shadows                           |
| `castShadows`     | Whether to cast shadows                              |
| `priority`        | Rendering priority of the renderer, lower values mean higher priority, default is 0 |
| `shaderData`      | Data required for rendering, including constants and macro switches |
| `materialCount`   | Total number of materials in the renderer            |
| `bounds`          | World bounding box of the renderer                   |
| `isCulled`        | Whether the renderer is culled in the current frame  |

These properties can be accessed from any renderer derived from `Renderer`.

```typescript
const renderer = cubeEntity.getComponent(Renderer);
renderer.castShadows = true;
renderer.receiveShadows = true;
renderer.priority = 1;
console.log("shaderData", renderer.shaderData);
console.log("materialCount", renderer.materialCount);
console.log("bounds", renderer.bounds);
console.log("isCulled", renderer.isCulled);
```

## Methods

The `Renderer` base class mainly provides methods for setting and getting materials, it is important to note that a renderer may contain multiple materials, so the following methods are more like **manipulating an array of materials**.

| Method                  | Description               |
| :---------------------- | :------------------------ |
| `setMaterial`           | Set a material in the array |
| `getMaterial`           | Get a material from the array |
| `getMaterials`          | Get the array of materials |
| `getInstanceMaterial`   | Get a copy of a material from the array |
| `getInstanceMaterials`  | Get copies of the array of materials |

