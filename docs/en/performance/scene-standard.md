---
order: 1
title: Scene Specification Guide
type: Performance
label: Performance
---

Galacean Engine supports mainstream 3D modeling software (C4D, 3ds Max, Maya, Blender) to export *.fbx* files. Considering runtime performance and compatibility issues, artists should pay attention to the 3D scene specifications:

### Model

- **Number of Triangles and Vertices:** It is recommended that the number of faces of a single scene model should not exceed **100,000 faces**. Try to reduce the number of model triangles and vertices as much as possible while ensuring visual effects, as both have a certain impact on _GPU_ performance loss or memory usage, especially the rendering performance of triangles.
- **Model Merging:** Artists should merge models that cannot move independently as much as possible to reduce rendering batches. At the same time, be careful not to merge models that span too large a scene range, which would cause the model to be unclippable.

### Material

- **Material Merging:** Merge materials as much as possible. As the basis for merging in a 3D engine, the prerequisite for merging all engine-level rendering batches is to use the same material, so keep the number of material objects as few as possible.
- **Material Selection:**
   - The choice of material model should be as simple as possible according to the art style. For example, cartoon-style models that directly merge lighting into the diffuse map can directly choose _unlit_ materials without using complex _PBR_ material models.
   - Prefer non-transparent materials, as both transparent blending and transparent clipping modes are more performance-consuming compared to non-transparent materials.

### Texture

Textures are the main consumers of memory resources. The texture size should not blindly pursue quality using ultra-large sizes. It is necessary to evaluate the actual display pixels of the rasterized texture in the actual project to use a similar texture size. Otherwise, using an oversized texture not only does not gain effect benefits but also wastes memory. Try to use textures with dimensions that are powers of 2. Under reasonable texture sizes, you can also use [texture compression](/en/docs/graphics/texture/compression/) to optimize memory usage.

### Node

Reduce the number of empty nodes at runtime. Empty nodes occupy a certain amount of memory and may bring potential [transform](/en/docs/core/transform) calculation costs. Artists should try to delete empty nodes and merge fragmented nodes.

### Animation

It is recommended to use skeletal animation for animation production. This is an animation technique that balances effects and memory in a 3D engine. However, due to the high computational cost of skeletal animation, especially in JS, which is not good at intensive calculations, artists should ensure that the number of bones is as few as possible when creating skeletal animations. This helps improve the performance and memory usage of skeletal animations. Generally, keeping it under **25** bones can ensure optimal performance on devices like iPhones, which have fewer GPU _uniforms_.

### UI

Reduce the waste of the Alpha part of the UI. For example, using nearly full-screen but mostly transparent images for UI rendering will bring a huge rendering burden to the GPU. Additionally, artists should merge UI textures themselves and make full use of texture space, as relying on the editor's algorithm to merge may still cause some waste.

### Effects

The texture part of effects is similar to UI. **Be sure to reduce the waste of the transparent part of the texture size**. Additionally, since effects usually have very serious OverDraw, such as particles, it is necessary to reduce the emission frequency of particles and other effects as much as possible.
