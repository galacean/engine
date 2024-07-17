---
order: 5
title: Restoring Artistic Effects in the Editor
type: Graphics
group: Model
label: Graphics/Model
---

![image.png](https://gw.alipayobjects.com/zos/OasisHub/5dd84590-7c37-4156-bb1a-498207880c75/1635493348596-92184a82-6aaa-4ab8-95e5-2d88762df213.png)

## Background

The Galacean engine currently has 3 ways to debug materials:

1. Modify material properties through code, refer to the [tutorial](/en/docs/graphics-material).

2. Visual debugging through the Galacean Editor, refer to the [tutorial](/en/docs/graphics-material).

3. **Export after adjusting in 3D modeling software [glTF](/en/docs/graphics-model-glTF)**

The first two methods directly use the engine for rendering, what you see is what you get, with no visual differences.

However, designers generally use the third method, adjusting visual effects in modeling software such as C4D, Blender, and then exporting to the engine for preview, only to find that the rendering results are inconsistent, with significant deviations, mainly due to:

- **Different software rendering algorithms.**

- **Different lighting.**

- **Some assets cannot be exported to glTF files.**

To achieve the maximum visual fidelity in the face of these differences, you can use the following methods:

- **Through baking textures, [export Unlit materials to the engine](/en/docs/graphics-material-Unlit)**

- **Use the same environment map (usually an HDRI file), direct lighting, and other variables.**

- **In the modeling software, only adjust properties and assets that can be exported to glTF.**

If you encounter the above problems, you can refer to this tutorial first, identify the specific reasons, and then refer to the corresponding solutions. If you still cannot resolve the issue, you can contact our team, as we will continuously improve this tutorial.

## Reasons

### Rendering Algorithm Differences

Currently, the most widely used algorithm in real-time rendering is the PBR algorithm, which has advantages such as energy conservation, physical correctness, and ease of operation. However, the specific implementation algorithms of different software are different, resulting in different rendering results. Galacean uses the **Cook-Torrance BRDF** reflectance equation and has been optimized for mobile devices.

It is worth mentioning that although different algorithms can cause certain visual differences, the physical laws remain consistent. For example, the higher the metallicness, the stronger the environmental reflection, and the weaker the diffuse reflection; the rougher the surface, the blurrier the environmental reflection, as shown in the image below:

![image.png](https://gw.alipayobjects.com/zos/OasisHub/ddfe44e2-c9ab-4692-b62f-b43b8965ee4c/1635432936926-b26c9652-6d95-4160-9743-b954025dfe32.png)

### Lighting Differences

Similar to the real world, 3D scenes can also add [direct and ambient light](/en/docs/graphics-light). By default, the Galacean scene **does not** have light sources, only a bluish [solid color diffuse reflection](/apis/core/#AmbientLight-diffuseSolidColor), as shown in the left image below; whereas many modeling software come with light sources:

![image.png](https://gw.alipayobjects.com/zos/OasisHub/391e9bd9-945d-474d-b3fb-8cb0490e2b6f/1635434650361-60d7f40f-9f22-4e48-8865-141415d638f9.png)

The ambient light is based on [cubemap textures](/en/docs/graphics-texture-cube) in IBL mode, requiring binding an HDRI texture to simulate the surrounding environment, which can be downloaded from the [internet](https://polyhaven.com/hdris). By default, the Galacean scene does not have an HDRI texture bound, while many modeling software come with a visually appealing surrounding environment:

![image.png](https://gw.alipayobjects.com/zos/OasisHub/61c2287b-0793-4763-a5f5-70567fcdf106/1635477315862-08b0c680-029b-400b-8600-1d8cf7a20c60.png)

### glTF Support Differences

The communication channel between the Galacean engine and modeling software is the [glTF file](/en/docs/graphics-model-glTF). glTF supports standard [PBR properties](https://www.khronos.org/registry/glTF/specs/2.0/glTF-2.0.html#reference-material-pbrmetallicroughness) and [common material properties](https://www.khronos.org/registry/glTF/specs/2.0/glTF-2.0.html#reference-material), and supports plugins like [ClearCoat](https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Khronos/KHR_materials_clearcoat), as shown in the image below. Therefore, as long as the operations in the modeling software can be exported to glTF, the engine can load them through the loader, while those additional operations, such as some parameters of [vRay](https://www.chaosgroup.com/cn/vray/3ds-max) materials, cannot be exported to glTF files.


![image.png](https://gw.alipayobjects.com/zos/OasisHub/2010b748-ab8b-4e46-8b15-3aee4daa71f9/1635434775734-f8454efe-d268-4f80-87ab-40f1cddf96ea.png)

![image.png](https://gw.alipayobjects.com/zos/OasisHub/acd35018-dc09-404b-a735-85a981384df1/1635434736607-cc408f27-a7d7-4a30-a7ea-e083f209d2c9.png)

## Solution

The primary prerequisite for ensuring visual fidelity is to debug materials in the same scene, with the same lighting, and the same ambient lighting, and then choose between real-time rendering or baking solutions.

### Unified Lighting

- Direct Lighting

As mentioned earlier, the engine does not come with direct lighting by default. Therefore, the simplest way to maintain fidelity is to remove lights in the modeling software, ensuring that both the modeling software and the Galacean engine only have ambient lighting (best performance).

<img src="https://gw.alipayobjects.com/zos/OasisHub/dc228a19-8ca7-4ffa-ae0f-6634d0aad373/1635493208445-f1a4f6ac-28bf-4e22-8067-552ad88411b6.png" alt="image.png" style="zoom:50%;" />

If certain scenes indeed require direct lighting, ensure that the modeling software can export the [glTF light plugin](https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Khronos/KHR_lights_punctual) (Google search keywords "\***\* modeling software KHR_lights_punctual" ), such as when exporting from Blender, select **Punctual Lights**.

<img src="https://gw.alipayobjects.com/zos/OasisHub/63a252d3-7f24-4b58-bfcd-45201c479b3c/1635494985124-29f86a28-2793-435a-8230-c9fea61bb60d.png" alt="image.png" style="zoom:50%;" />

If the modeling software does not support exporting this lighting plugin, you can transfer to Blender for export or verbally describe the lighting data to the developers.

- Ambient Lighting

As mentioned earlier, the engine does not come with an environment map, i.e., HDRI map, by default, but modeling software usually includes it, such as Blender:

<img src="https://gw.alipayobjects.com/zos/OasisHub/f1683b34-c991-490f-835a-918693debbdf/1635495607766-f7f7deea-656a-4f7b-90cd-1ebf2364f6a7.png" alt="image.png" style="zoom:50%;" />

You can download your favorite HDRI images from [online](https://polyhaven.com/hdris), then debug in the modeling software. Once satisfied, deliver the final HDRI to the developers (as glTF does not support exporting HDR).

The method to bind an environment map in modeling software is simple. You can Google search keywords "\*\*\* modeling software environment IBL" , using Blender as an example:

<img src="https://gw.alipayobjects.com/zos/OasisHub/52e54319-7c7f-42a5-bf16-e7bca854734c/1635496231128-2b912395-f1eb-48cd-b5e9-323cb28c8c49.png" alt="image.png" style="zoom:50%;" />

### Real-Time Rendering Solution

- Rendering Solution

After unifying the lighting, you can choose a rendering solution. If you want materials to be affected by lighting, have real-time light interaction, or have transparency and refraction requirements, you should choose a real-time rendering solution, i.e., the engine's PBR solution.

- Debugging Materials

As mentioned earlier, Galacean PBR uses the **Cook-Torrance BRDF** reflectance equation, which is closest to the Principled BSDF - GGX algorithm in Blender:

<img src="https://gw.alipayobjects.com/zos/OasisHub/623b429e-b731-4c00-85ab-fd2cd270e695/1635496608900-f47ae7b7-e917-475a-9b24-74a91d485e8e.png" alt="image.png" style="zoom:50%;" />

You can refer to how to debug material parameters that can be exported to glTF through the [Blender official tutorial](https://docs.blender.org/manual/en/2.80/addons/io_scene_gltf2.html#). Similarly, for other modeling software, you can Google search the keywords "\*\*\* modeling software export glTF".

Another convenient way to reference is to import a glTF demo in the modeling software ([click to download](https://gw.alipayobjects.com/os/bmw-prod/85faf9f8-8030-45b2-8ba3-09a61b3db0c3.glb)). This demo has comprehensive PBR properties that you can use for debugging. For example, after importing into Blender, the material panel will display as follows:

![image.png](https://gw.alipayobjects.com/zos/OasisHub/6643f12a-6226-490f-b853-f962a38cb09b/1635499476109-753aae7a-5ffa-4d52-ace1-4eaaef81919f.png)

- Export Validation

After exporting to glTF, you can drag the file into the [glTF Viewer](https://galacean.antgroup.com/#/gltf-viewer) to check if the colors, textures, parameters, etc., are correct:

<img src="https://gw.alipayobjects.com/zos/OasisHub/a76d35e6-e222-4877-89a4-c44a117a1284/1635499678001-f7df3dc2-2219-4516-887b-fc5d51dc3521.png" alt="image.png" style="zoom:50%;" />

### Baking Solution

Different from real-time rendering, if your rendering scene is completely static, without the need for light-shadow interactions, refraction, transparency effects, etc., then using a baking solution will better suit your artistic creation. This is because the baking solution can ignore issues related to lighting, glTF support, etc. You can confidently use the built-in renderer of modeling software, powerful plugins like [vRay](https://www.chaosgroup.com/cn/vray/3ds-max), and finally export to the [glTF Unlit plugin](https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Khronos/KHR_materials_unlit).

We also provide several tutorials for baking solutions. You can learn more details by searching for keywords like "\*\*\* modeling software bake KHR_materials_unlit":

- [C4D Baking Tutorial](/en/docs/art-bake-c4d)

- [Blender Baking Tutorial](/en/docs/art-bake-blender)

- [Exporting Unlit Materials](/en/docs/graphics-material-Unlit)

### Galacean Preview Plugin (Under Development)

In the future, we will invest in plugin development to embed the Galacean preview plugin in various modeling software, ensuring a WYSIWYG experience and eliminating steps like glTF file validation.
