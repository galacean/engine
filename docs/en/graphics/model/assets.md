---
order: 3
title: Model Assets
type: Graphics
group: Model
label: Graphics/Model
---

After the model is imported, new model assets will be added to the **[Assets Panel](/en/docs/assets-interface)**. Clicking on the asset thumbnail will display basic information about the model.

<img src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*Aiu9SpMRvxYAAAAAAAAAAAAADhuCAQ/original" alt="image-20231009112328575" style="zoom:50%;" />

| Area       | Function         | Description                                                        |
| :--------- | :--------------- | :----------------------------------------------------------------- |
| Viewport   | Preview          | Similar to a glTF viewer, developers can easily observe the model from different angles and animations |
| Basic Info | URL              | CDN link of the model                                              |
|            | DrawCall         | Number of draw calls for this model                                |
|            | ComputeTangents  | Processing of tangent information in the model's vertex data        |
| Material Remapping | Material list in the model | Corresponding remapped materials                                |
| Export     | Cut first frame  | Whether to trim the first frame                                    |
|            | isGLB            | Whether to export in GLB format                                    |
|            | Export glb/glTF  | Export the model locally                                           |

## Sub-assets of the Model

Hover over the model asset thumbnail, click on the triangle button that appears on the right side, and information about the sub-assets contained in the model asset, such as meshes, textures, animations, and materials, will be displayed in the resource panel.

<img src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*v_imTKivm0oAAAAAAAAAAAAADhuCAQ/original" alt="image-20231009112328575" style="zoom:50%;" />

### Mesh Sub-asset

Clicking on the mesh sub-asset thumbnail will display basic information about the mesh as follows:

<img src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*snL9SaV1tp4AAAAAAAAAAAAADhuCAQ/original" alt="image-20231009112328575" style="zoom:50%;" />

| Area       | Function         | Description                   |
| :--------- | :--------------- | :----------------------------- |
| Vertex Data| Vertex Info List | Format and stride of vertex information |
| Submesh    | Submesh List     | Drawing information of submeshes |

### Texture Sub-asset

The basic information of a texture sub-asset is the only difference from a [texture](/en/docs/graphics-texture) asset, as most texture information is read-only.

<img src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*o8mdQrcfvcoAAAAAAAAAAAAADhuCAQ/original" alt="image-20231009112328575" style="zoom:50%;" />

### Material Sub-Asset

Similarly, the [material](/en/docs/graphics-material) sub-asset is as follows:

<img src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*ATbsRrxjiNsAAAAAAAAAAAAADhuCAQ/original" alt="image-20231009112328575" style="zoom:50%;" />

In general, users do not need to perform any operations on the material that comes with the model; however, in certain scenarios, developers may want to manually adjust the material, such as changing the color. In this case, we can duplicate the original material by clicking **duplicate & remap**, and then make modifications based on the original material parameters:

<img src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*R9S1Sr1PivEAAAAAAAAAAAAADhuCAQ/original" alt="image-20231009112328575" style="zoom:50%;" />

### Animation Sub-Asset

Animation sub-assets appear in the model asset in the form of [animation clips](/en/docs/animation-clip) and are also **read-only**.

<img src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*rAq5T4i3TTQAAAAAAAAAAAAADhuCAQ/original" alt="image-20231009112328575" style="zoom:50%;" />

