---
order: 0
title: Asset Overview
type: Asset Workflow
label: Resource
---

In Galacean, grids, materials, textures, sprites, atlases, animation clips, animation controllers, and so on are all considered as assets.

## Asset Workflow

In Galacean, the typical workflow for assets is as follows:

```mermaid
flowchart LR
   Import Assets --> Edit Assets --> Build Export --> Distribute --> Load
```

This chapter will mainly cover:

- [Asset Types](/en/docs/assets-type): Introducing **built-in asset types** and how to **customize asset loaders**
- [CRUD operations on assets](assets-interface): while in edit mode
- How assets are [exported and deployed](assets-build) after building the project
- How to [load assets](assets-load) at runtime
- [Garbage collection](assets-gc) at runtime
