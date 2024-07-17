---
order: 1
title: Scene Specification Guide
type: Performance
label: Performance
---

The Galacean Engine supports popular 3D modeling software (C4D, 3ds Max, Maya, Blender) to export *.fbx* files. Considering runtime performance and compatibility issues, artists should pay attention to the 3D scene specifications:

### Models

- **Triangle Faces and Vertex Count:** It is recommended that the face count of a single scene model should not exceed **100,000 faces**. While ensuring visual effects, try to reduce the number of model triangle faces and vertices as they have a significant impact on _GPU_ performance or VRAM usage, especially the rendering performance of triangle faces.
- **Model Merging:** Artists should merge models that cannot be independently moved to reduce rendering batches as much as possible. Also, be careful not to merge models with a large scene span that may cause issues with model clipping.

### Materials

- **Material Merging:** Merge materials as much as possible. Materials serve as the foundation for merging rendering batches in a 3D engine. The prerequisite for all engine-level rendering batch merging is to use the same material, so keep the number of material objects as low as possible.
- **Material Selection:**
   - Material model selection should be simplified based on the artistic style. For example, for cartoon-style models where lighting is merged into the diffuse texture, you can directly choose _unlit_ materials without the need for complex _PBR_ material models.
   - Prioritize non-transparent materials as they are less performance-intensive compared to transparent materials, whether in terms of material transparency blending or transparent clipping modes.

### Textures

Textures consume a significant amount of VRAM resources. Avoid blindly pursuing quality with oversized textures. Evaluate the actual display pixels rasterized by textures in the project to use textures of similar sizes. Using excessively large textures not only fails to yield performance benefits but also wastes VRAM. Preferably use textures with sizes that are powers of 2. Additionally, you can continue to optimize VRAM usage by using [texture compression](/en/docs/graphics-texture-compression) within reasonable texture sizes.

### Nodes

Reduce the number of empty nodes at runtime. Empty nodes consume a certain amount of memory and may introduce potential computational costs for transformations. Artists should strive to delete empty nodes and merge fragmented nodes as much as possible.

### Animation

For animation production, it is recommended to use skeletal skinning animation. This is a technique in 3D engines that balances effects and memory usage. However, due to the significant computational cost of skeletal animation, especially in languages like JS that are not proficient in intensive computations, artists should ensure a minimal number of bones in skeletal animations. Keeping it below **25** bones can enhance the performance and memory usage of skeletal animations, especially on devices with limited GPU _uniform_ counts like iPhones.

### UI

Avoid wasting the Alpha part of UI elements. For instance, drawing UI elements with nearly full-screen but mostly transparent images can impose a significant rendering burden on the GPU. Additionally, artists should merge UI textures themselves and make efficient use of texture space as relying on editor algorithms for merging may still result in some waste.

### Effects

Similar to UI textures, **reduce wastage in the size of transparent parts of effect textures**. Additionally, since effects typically have severe OverDraw, such as particles, it is essential to minimize emission frequencies on effects like particles to reduce rendering overhead.
