---
order: 0
title: Grid Overview
type: Graphics
group: Grid
label: Graphics/Mesh
---

A grid is a data object of the [Mesh Renderer](/en/docs/graphics-renderer-meshRenderer), which describes various information about vertices (such as position, topology, vertex color, UV, etc.).

## Mesh Assets

Mesh assets are typically sourced from:

- Importing models to acquire [model-embedded mesh assets](/en/docs/graphics-model-assets) created by third-party tools through [model importation](/en/docs/graphics-model-importGlTF}).
- Editor's [built-in mesh assets](/en/docs/graphics-mesh-primitiveMesh}).
- Developers creating [mesh assets](/en/docs/graphics-mesh-primitiveMesh}) themselves.

## Usage

When setting a mesh for the mesh renderer, simply select the corresponding mesh asset.

<img src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*fmhoSrmQQ78AAAAAAAAAAAAADhuCAQ/original" alt="import" style="zoom:100%;" />

Similarly, in scripts, the use of meshes will be more flexible, but also more complex. Let's first look at

| Type                                             | Description                                                                                                                                         |
| :----------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------- |
| [ModelMesh](/en/docs/graphics-mesh-modelMesh)      | Encapsulates methods for setting vertex and index data, making it very simple and easy to use. Developers who want to quickly customize geometries can use this class. |
| [BufferMesh](/en/docs/graphics-mesh-bufferMesh)    | Allows for free manipulation of vertex buffer and index buffer data, as well as some geometry drawing-related instructions. It is efficient, flexible, and concise. Developers who want to efficiently and flexibly implement custom geometries can use this class. |
| [Primitive Mesh](/en/docs/graphics-mesh-primitiveMesh) | Essentially a preset ModelMesh, containing common shapes like cuboids, spheres, planes, cylinders, tori, cylinders with capsules, etc. |

## Usage

In the editor, meshes appear in the form of mesh assets, which can be accessed through

```typescript
const meshRenderer = entity.addComponent(MeshRenderer);
meshRenderer.mesh = new ModelMesh(engine);
// or
meshRenderer.mesh = new BufferMesh(engine);
```

## Common Geometries

Constructing mesh data for geometries manually can be a painful process, so Galacean provides some practical geometries.

- [Primitive Meshes](/en/docs/graphics-model}): Includes common shapes like cuboids, spheres, planes, cylinders, tori, cylinders with capsules, etc.
