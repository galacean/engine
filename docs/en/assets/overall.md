---
order: 0
title: Asset Overview
type: Asset Workflow
label: Resource
---

In Galacean, meshes, materials, textures, sprites, atlases, animation clips, animation controllers, etc., are all considered assets.

## Asset Workflow

In Galacean, the asset workflow typically follows these steps:

```mermaid
flowchart LR
   A[Import Assets] --> B[Edit Assets] --> C[Build and Export] --> Distribute --> Load
```

This chapter will mainly cover:

- How to [customize asset loaders](/en/docs/assets/custom)
- [CRUD operations on assets](/en/docs/assets/interface) in edit mode
- How to [export and deploy assets](/en/docs/assets/build) after building the project
- How to [load assets](/en/docs/assets/load) at runtime
- How to [perform garbage collection](/en/docs/assets/gc) at runtime
