---
order: 0
title: Shader Overview
type: Shader
group: Mesh
label: Graphics/Shader
---

As mentioned in the [Material Tutorial](/en/docs/graphics-material-composition), shaders can write vertex and fragment code to determine the color of pixels rendered to the screen.

<img src="https://gw.alipayobjects.com/zos/OasisHub/a3f74864-241e-4cd8-9ad4-733c2a0b2cc2/image-20240206153815596.png" alt="image-20240206153815596" style="zoom:50%;" />

This section contains the following relevant information:

- Built-in Shaders
  - [PBR](/en/docs/graphics-shader-pbr)
  - [Unlit](/en/docs/graphics-shader-unlit)
  - [Blinn Phong](/en/docs/graphics-shader-blinnPhong)
- [Custom Shaders](/en/docs/graphics-shader-custom)
- [Shader Lab](/en/docs/graphics-shader-lab)

## Built-in Shaders

| Type | Description |
| :-- | :-- |
| [Unlit ](/en/docs/graphics-material-Unlit) | Unlit material is suitable for rendering pre-baked models. It only requires setting a basic texture or color to display high-quality rendering results obtained offline. However, the drawback is that it cannot show real-time lighting interactions because Unlit rendering is determined by textures and is not affected by any lighting. Refer to [Baking Tutorial](/en/docs/graphics-bake-blender) and [Export Unlit Tutorial](/en/docs/graphics-material-Unlit) for more information. |
| [Blinn Phong ](/en/docs/graphics-material-BlinnPhong) | Blinn Phong material is suitable for scenes that do not require a high level of realism. Although it does not follow physics, its efficient rendering algorithm and basic optical components make it suitable for many scenarios. |
| [PBR ](/en/docs/graphics-material-PBR) | PBR material is suitable for applications that require realistic rendering because PBR is based on physical rendering, following energy conservation. By adjusting parameters such as metalness, roughness, and lighting, developers can ensure that the rendering effects are physically accurate. |

The following properties can be directly used in built-in shaders.

<img src="https://gw.alipayobjects.com/zos/OasisHub/94cf8176-569d-4605-bd73-967b03316c3d/image-20240206173751409.png" alt="image-20240206173751409" style="zoom:50%;" />

| Parameter | Application |
| :-- | :-- |
| [isTransparent](/apis/core/#BaseMaterial-isTransparent) | Transparency. It can be used to set whether the material is transparent. If set to transparent, you can use [BlendMode](/apis/core/#BaseMaterial-blendMode) to set the color blending mode. |
| [alphaCutoff](/apis/core/#BaseMaterial-alphaCutoff) | Alpha cutoff value. It can be used to set a cutoff value, where fragments with transparency lower than this value will be clipped. Refer to the [example](${examples}blend-mode) |
| [renderFace](/apis/core/#BaseMaterial-renderFace) | Render face. It can determine whether to render the front face, back face, or both faces. |
| [blendMode](/apis/core/#BaseMaterial-blendMode) | Color blending mode. When the material is set to transparent, this enum can be used to determine the color blending mode. Refer to the [example](${examples}blend-mode) |
| [tilingOffset](/apis/core/#BlinnPhongMaterial-tilingOffset) | Scale and offset of texture coordinates. It is a Vector4 data that controls the scaling and offset of texture coordinates in the UV direction. Refer to the [example](${examples}tiling-offset) |
