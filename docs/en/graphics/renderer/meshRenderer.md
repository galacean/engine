---
order: 1
title: Mesh Renderer
type: Graphics
group: Renderer
label: Graphics/Renderer
---

[MeshRenderer](/apis/core/#MeshRenderer) is a mesh renderer component that uses mesh objects (such as cubes) as the data source for geometric outlines. When an entity is mounted with a mesh renderer component, you only need to set its `mesh` and `material` to render the object.

<playground src="scene-basic.ts"></playground>

## Usage

In the editor **[Hierarchy Panel](/en/docs/interface/hierarchy)**, you can quickly create a node with a cuboid mesh renderer ( **Hierarchy Panel** -> **Right Click** -> **3D Object** -> **Cuboid** ).

<img src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*Pca9RZvOsNMAAAAAAAAAAAAADhuCAQ/original" alt="image-20231007153753006"  />

Of course, you can also mount a mesh renderer to an existing node in the scene and set any [mesh](/en/docs/graphics/mesh/mesh/) and [material](/en/docs/graphics/material/material/). ( **Select Node** -> **[Inspector Panel](/en/docs/interface/inspector)** -> **Add Component** -> **Mesh Renderer** ).

<img src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*UHfjTYk0b4sAAAAAAAAAAAAADhuCAQ/original" alt="image-20231007153753006"  />

The corresponding usage in the script is as follows:

```typescript
const cubeEntity = rootEntity.createChild("cube");
const cube = cubeEntity.addComponent(MeshRenderer);
cube.mesh = PrimitiveMesh.createCuboid(engine, 2, 2, 2);
cube.setMaterial(new BlinnPhongMaterial(engine));
```

## Properties

In the editor, you can easily set the properties of the mesh renderer.

<img src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*5Y-3TrYyWo8AAAAAAAAAAAAADhuCAQ/original" alt="image-20231007153753006" style="zoom:50%;" />

| Setting           | Explanation                                               |
| :---------------- | :-------------------------------------------------------- |
| `material`        | [Material](/en/docs/graphics/material/material/) information of the object to be rendered |
| `mesh`            | [Mesh](/en/docs/graphics/mesh/mesh/) information of the object to be rendered       |
| `receiveShadows`  | Whether to receive shadows                                |
| `castShadows`     | Whether to cast shadows                                   |
| `priority`        | Rendering priority of the renderer, the smaller the value, the higher the priority, default is 0 |

Compared to the basic [Renderer](/en/docs/graphics/renderer/renderer/), the mesh renderer can also set whether to support vertex colors (vertex color data is included in the vertex information of the mesh).

| Property            | Explanation           |
| :------------------ | :-------------------- |
| `enableVertexColor` | Whether to support vertex colors |

```typescript
const meshRenderer = entity.getComponent(MeshRenderer);
// Enable vertex colors
meshRenderer.enableVertexColor = true;
```

## Methods

The mesh renderer does **not add** any new methods, but it is important to note that in many cases, the mesh renderer's mesh contains **several sub-meshes**. If you want each sub-mesh to correspond to **different materials**, you can specify the corresponding **mesh index** when setting it, otherwise, the same material will be used by default.
