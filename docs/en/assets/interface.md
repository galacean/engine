---
order: 1
title: Asset Panel
type: Asset Workflow
label: Resource
---

<img src="https://gw.alipayobjects.com/zos/OasisHub/116f21cb-1cae-4492-92bb-4276173cae9b/image-20240319102237183.png" alt="image-20240319102237183" style="zoom:50%;" />

The asset panel is an important panel in the editor that helps you manage all the assets used in the scene. In the asset panel, you can view and manage all the assets used in the scene, such as materials, textures, models, etc. Through the asset panel, you can add or delete assets, as well as categorize them for better organization.

Currently, the editor supports the following uploaded or created assets (**+** indicates composite files):

| Supported Assets                                 | Description                                                    | Exchange Format                                       | Creation Method |
| ------------------------------------------------ | -------------------------------------------------------------- | ----------------------------------------------------- | ---------------- |
| Folder                                           | Similar to operating system folders, you can drag files into the folder |                                                     | Create           |
| Scene                                            | Used for entity tree management                                |                                                     | Create           |
| Model                                            | 3D model files                                                 | `.gltf`+`.bin`+`.jpg`, `.glb`+`.jpg`, `.fbx`+`.jpg`  | Upload           |
| Mesh                                             | Cannot be added, only internal meshes and meshes in models can be used |                                                     | -                |
| Material                                         | Used to adjust rendering effects                               |                                                     | Create           |
| Texture                                          | Upload image files to create 2D textures                       | `.png`,`.jpg`,` .webp`                               | Upload           |
| Cube Texture (TextureCube)                       | Used for scene sky and ambient light                           | `.hdr`                                               | Upload           |
| Sprite                                           | You can directly upload image files to create sprites (skipping the step of creating a sprite and then binding a texture) | `.png`,`.jpg`,` .webp`                               | Create/Upload    |
| Sprite Atlas                                     | Packs multiple sprites into an atlas for optimizing 2D assets  |                                                     | Create           |
| Font                                             | Used to create 2D text                                         | `.ttf`, `.otf`, `.woff`                              | Upload           |
| Script                                           | Used to write business logic                                   | `.ts`                                                | Create           |
| Animation Controller                             | Used to organize animation clips and control animation states  |                                                     | Create           |
| Animation Clip                                   | Pre-made, continuous animation data containing keyframe changes over a period of time | `.ts`                                                | Create           |
| Animation State Machine Script                   | Program script used to control and manage animation state machine behavior |                                                     | Create           |
| Lottie                                           | Supports lottie file uploads                                   | `.json`(+`.jpg`), images support base64 embedded and standalone images | Upload           |
| Spine                                            | Supports spine file uploads                                    | `.json` + `.atlas` + `.jpg`                          | Upload           |

### Adding Assets

To add assets to the scene, you can click the add button on the asset panel or use the add option in the right-click menu of the asset panel to add new assets. After adding assets, you can edit the properties of the assets in the **[Inspector Panel](/en/docs/interface/inspector)**. The asset types in the asset panel are very rich, such as materials, textures, models, fonts, etc. Refer to the table above for details.

<img src="https://gw.alipayobjects.com/zos/OasisHub/aec9a0de-98c4-47ce-bc4d-6a7a80decfc8/image-20240319103341208.png" alt="image-20240319103341208" style="zoom:50%;" />

You can also drag files into the asset panel to add assets. For multiple files, you can select and drag them into the asset panel together.

<img src="https://gw.alipayobjects.com/zos/OasisHub/dc4a06ee-c92a-4ee4-8062-11cd26cf3201/drag6.gif" alt="drag6" style="zoom:67%;" />

### Organizing Assets

Assets in the asset panel can be managed by categorization for better organization. You can create folders in the asset panel and move assets into the corresponding folders (you can also move them into folders in the left directory) to achieve categorized management. Folders in the asset panel can be nested, allowing you to create multi-level folders for better organization of assets.

<img src="https://gw.alipayobjects.com/zos/OasisHub/92fb2341-8f52-451b-a4fd-9ca577a1f480/drag7.gif" alt="drag7" style="zoom:67%;" />

The asset panel provides a user-friendly toolbar for browsing assets, helping you quickly find a specific asset or type of asset. You can also modify the browsing mode, sorting method, and thumbnail size of assets according to your usage habits.

<img src="https://gw.alipayobjects.com/zos/OasisHub/d1f0daff-a503-4e24-b3eb-8a86d8faa7a1/drag8.gif" alt="drag8" style="zoom:67%;" />

After organizing the assets, each asset has a **relative path**. You can right-click an asset to copy its path.

<img src="https://gw.alipayobjects.com/zos/OasisHub/8749922b-9989-47c2-ba42-85c122391c85/image-20240319132804611.png" alt="image-20240319132804611" style="zoom:50%;" />

This is important for project development because projects often need to load assets asynchronously, meaning that certain assets (or even scenes) do not need to be loaded during initialization. You can control the loading of an asset through scripts. For specific syntax, refer to the usage of [Assets](/en/docs/assets/load) and [Scenes](/en/docs/core/scene). For example, to load a scene:

```typescript
this.engine.resourceManager.load({ url: "...", type: AssetType.Scene });
```

### Deleting Assets

You can delete an asset by selecting it and clicking the delete button on the asset panel or using the delete option in the right-click menu. When deleting assets, you need to be aware of whether the deleted asset will affect the association of other nodes in the scene.

## Copying and Pasting Assets

You can right-click an asset in the asset panel to copy it, then paste it into the folder you entered:

![2024-07-19 14.18.11](https://mdn.alipayobjects.com/rms/afts/img/A*0Wf5T6tEvnYAAAAAAAAAAAAAARQnAQ/original/2024-07-19 14.18.11.gif)

You can also use `⌘`+ `C` and `⌘`+ `V` operations.

### Previewing Assets

After selecting an asset, the **[Inspector Panel](/en/docs/interface/inspector)** on the right will display the configurable properties of the asset. The configurable items corresponding to different assets are different. For example, glTF assets will display a model preview window, and material assets will display detailed material configuration options.

<img src="https://gw.alipayobjects.com/zos/OasisHub/e90ace3a-7b03-49cc-ad9a-e3aa51f17283/image-20240319120017637.png" alt="image-20240319120017637" style="zoom:50%;" />

### Using Assets

部分资产（如 glTF 资产）支持拖拽到场景中或节点树中。

<img src="https://gw.alipayobjects.com/zos/OasisHub/c710e1e4-2d73-4e76-a4fa-b03caa1f68bc/drag9.gif" alt="drag9" style="zoom:67%;" />

### Shortcuts

| Shortcut        | Function    |
| --------------- | ----------- |
| `⌫` / `Delete`  | Delete asset |
| `⌘` + `D`       | Duplicate asset |
| `⌘`+ `F`        | Search asset |
| `⌘`+ `C`        | Copy asset |
| `⌘`+ `V`        | Paste asset |
