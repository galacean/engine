---
order: 0
title: Model Overview
type: Graphics
group: Model
label: Graphics/Model
---

A model typically refers to a three-dimensional model created by designers using 3D modeling software, containing a series of information such as [mesh](/en/docs/graphics-mesh), [material](/en/docs/graphics-material), [texture](/en/docs/graphics-texture), and [animation](/en/docs/animation-overview). In Galacean, it is also considered as an asset. The model asset workflow is usually as follows:

```mermaid
	flowchart LR
	Model exported from modeling software --> Import model into Galacean editor --> Adjust model
```

This chapter mainly addresses the following questions that developers may encounter:

- Requirements for model formats. The editor currently supports importing models in `glTF` or `FBX` formats, but ultimately, the editor will convert them into a [glTF](/en/docs/graphics-model-glTF) format that can also be parsed at runtime.
- [Importing models](/en/docs/graphics-model-importGlTF}) into the editor
- What are [model assets](/en/docs/graphics-model-assets})
- [Loading and using models](/en/docs/graphics-model-use})
- [Restoring artistic effects in the editor](/en/docs/graphics-model-restoration})
- [Model optimization](/en/docs/graphics-model-opt})

