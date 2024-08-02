---
order: 1
title: Asset Panel
type: Asset Workflow
label: Resource
---

<img src="https://gw.alipayobjects.com/zos/OasisHub/116f21cb-1cae-4492-92bb-4276173cae9b/image-20240319102237183.png" alt="image-20240319102237183" style="zoom:50%;" />

The asset panel is an important panel in the editor that helps you manage all the assets used in the scene. In the asset panel, you can view and manage all the assets used in the scene, such as materials, textures, models, and more. Through the asset panel, you can add or remove assets, as well as categorize and organize assets for better asset management.

Currently, the editor supports uploading or creating the following assets (**+** indicates composite files):

| Supported Assets                                  | Description                                                   | Exchange Format                                      | Creation  |
| ------------------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------- | --------- |
| Folder                                            | Similar to an operating system folder, files can be dragged into the folder |                                                     | Create    |
| Scene                                             | Used for entity tree management                               |                                                     | Create    |
| Model                                             | 3D model files                                                | `.gltf`+`.bin`+`.jpg`, `.glb`+`.jpg`, .`fbx`+`.jpg` | Upload    |
| Mesh                                              | Cannot be added, can only use internal meshes and meshes in models |                                                     | -         |
| Material                                          | Used to adjust rendering effects                               |                                                     | Create    |
| Texture                                           | Upload image files to create 2D textures                      | `.png`,`.jpg`,` .webp`                              | Upload    |
| TextureCube                                       | Used for scene sky and ambient light                          | `.hdr`                                              | Upload    |
| Sprite                                            | Can directly upload image files to create sprites (skipping the step of creating sprites and then binding textures) | `.png`,`.jpg`,` .webp`                              | Create/Upload |
| SpriteAtlas                                       | Pack multiple sprites into an atlas for optimizing 2D assets  |                                                     | Create    |
| Font                                              | Used to create 2D text                                        | `.ttf`, `.otf`, `.woff`                             | Upload    |
| Script                                            | Used to write business logic                                   | `.ts`                                               | Create    |
| Animation Controller                             | Used to organize animation clips and control animation states |                                                     | Create    |
| Animation Clip                                   | Pre-made continuous animation data containing keyframe change information over a period of time | `.ts`                                               | Create    |
| Animation State Machine Script                   | Program script used to control and manage animation state machine behavior |                                                     | Create    |
| Lottie                                            | Supports uploading lottie files                               | `.json`(+`.jpg`), images support base64 embedded and standalone images | Upload    |
| Spine                                             | Supports uploading spine files                                 | `.json` + `.atlas` + `.jpg`                         | Upload    | 



### Add Assets

To add assets to your scene, you can click the add button on the asset panel or use the add option in the right-click menu of the asset panel to add new assets. After adding assets, you can edit the properties of the assets in the **[Inspector Panel](/en/docs/interface/inspector)**. The asset panel offers a wide variety of asset types, such as materials, textures, models, fonts, and more. Refer to the table above for specific details.

<img src="https://gw.alipayobjects.com/zos/OasisHub/aec9a0de-98c4-47ce-bc4d-6a7a80decfc8/image-20240319103341208.png" alt="image-20240319103341208" style="zoom:50%;" />

You can also drag files into the asset panel to add assets. Simply select multiple files and drag them into the asset panel to add them.

<img src="https://gw.alipayobjects.com/zos/OasisHub/dc4a06ee-c92a-4ee4-8062-11cd26cf3201/drag6.gif" alt="drag6" style="zoom:67%;" />

### Organize Assets

Assets in the asset panel can be organized by categories for better asset management. You can create folders in the asset panel and move assets into the corresponding folders (you can also move them into folders in the left directory) to categorize them. Folders in the asset panel can be nested, allowing you to create multiple levels of folders for better asset organization.

<img src="https://gw.alipayobjects.com/zos/OasisHub/92fb2341-8f52-451b-a4fd-9ca577a1f480/drag7.gif" alt="drag7" style="zoom:67%;" />

The asset panel provides a user-friendly toolbar for browsing assets, helping you quickly find a specific asset or category of assets. You can also customize the browsing mode, sorting method, and thumbnail size of assets based on your preferences.

<img src="https://gw.alipayobjects.com/zos/OasisHub/d1f0daff-a503-4e24-b3eb-8a86d8faa7a1/drag8.gif" alt="drag8" style="zoom:67%;" />

After organizing assets, each asset has a **relative path**, and you can right-click on an asset to copy its path.

<img src="https://gw.alipayobjects.com/zos/OasisHub/8749922b-9989-47c2-ba42-85c122391c85/image-20240319132804611.png" alt="image-20240319132804611" style="zoom:50%;" />

This is crucial for project development because there are often cases where assets need to be asynchronously loaded in a project, meaning that certain assets (or even scenes) do not need to be loaded during initialization and can be controlled to load through scripts. For specific syntax, refer to the [Assets](/en/docs/assets-load) and [Scenes](/en/docs/core/scene) loading usage. For loading a scene, for example:

```typescript
this.engine.resourceManager.load({ url: "...", type: AssetType.Scene });
```

### Delete Assets

You can delete an asset by selecting it and clicking the delete button on the asset panel or using the delete option in the right-click menu. When deleting assets, make sure to consider whether the deleted asset will affect the relationships of other nodes in the scene.

### Preview Assets

After selecting an asset, the properties that can be configured for that asset will be displayed in the **Inspector Panel** on the right. Different assets have different configurable options. For example, a glTF asset will show a model preview window, while a material asset will display detailed material configuration options.

<img src="https://gw.alipayobjects.com/zos/OasisHub/e90ace3a-7b03-49cc-ad9a-e3aa51f17283/image-20240319120017637.png" alt="image-20240319120017637" style="zoom:50%;" />

### Using Assets

Some assets (such as glTF assets) support dragging into the scene or node tree.

<img src="https://gw.alipayobjects.com/zos/OasisHub/c710e1e4-2d73-4e76-a4fa-b03caa1f68bc/drag9.gif" alt="drag9" style="zoom:67%;" />

### Keyboard Shortcuts

| Shortcut       | Function     |
| -------------- | ------------ |
| `⌫` / `Delete` | Delete Resource |
| `⌘` + `D`      | Copy Resource |
| `⌘`+ `F`       | Search Resource |

Please paste the Markdown content you would like me to translate.
