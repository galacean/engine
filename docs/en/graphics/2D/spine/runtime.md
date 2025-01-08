
---
order: 2  
title: Using in Code  
type: Graphics  
group: Spine  
label: Graphics/2D/Spine/runtime  
---

This section introduces how to use the Galacean Spine runtime in code.

---

## Installation  

Whether for a project exported via the editor or a procode project, you need to install `@galacean/engine-spine` (Galacean Spine Runtime) to load and render Spine animations.

```typescript
npm install @galacean/engine-spine --save
```

After successful installation, import it into your code:  
```typescript
import { SpineAnimationRenderer } from "@galacean/engine-spine";
```

Once installed and imported, the editor's `resourceManager` can recognize and load Spine animation assets. The Galacean Spine loader supports both assets uploaded via the editor and custom-uploaded assets.

---

## Loading Assets and Adding Them to the Scene  

### Loading Assets Uploaded to the Galacean Editor  

After [exporting an editor project](/docs/assets/build/), `Spine animations already added to the scene will automatically load when the scene file is loaded`:

```typescript
// Spine animations added to the scene will load automatically when the scene file is loaded
await engine.resourceManager.load({
  url: projectInfo.url,
  type: AssetType.Project,
});
```

**If not added to the scene**, the assets must be loaded manually in code by following these steps:

1. Download the editor project.  

   Note: If the `Upload Assets to CDN` option is checked, animations will load via CDN links; otherwise, local relative file paths will be used.  

   <img src="https://mdn.alipayobjects.com/huamei_kz4wfo/afts/img/A*0rZJQJRNamIAAAAAAAAAAAAADsp6AQ/original" width="260" alt="Project export panel">

2. Locate the Spine asset files.  

   After downloading the project, open the `project.json` file and find the `url` property.  

   - If `Upload Assets to CDN` was checked, the JSON file will contain the Spine asset link:  

     <img src="https://mdn.alipayobjects.com/huamei_kz4wfo/afts/img/A*-eG9RafXm64AAAAAAAAAAAAADsp6AQ/original" width="630" alt="Find spine asset">

   - If `Upload Assets to CDN` was not checked, Spine assets can be found in the local `public` folder. Use a **relative path** for loading:  

     <img src="https://mdn.alipayobjects.com/huamei_kz4wfo/afts/img/A*KT9yTZWQ2C8AAAAAAAAAAAAADsp6AQ/original" width="300" alt="Find spine asset">

3. Use `resourceManager` to load the assets.  

   Once you have the Spine skeleton file link, use `resourceManager` to load it. Manually adding Spine to the scene requires creating a new entity and adding the `SpineAnimationRenderer` component:

   ```typescript
   import { SpineAnimationRenderer } from "@galacean/engine-spine";

   // Load and get the Spine resource
   const spineResource = await engine.resourceManager.load({
     url: "https://galacean.raptor.json", // or use a relative file path, e.g., '../public/raptor.json'
     type: "spine", // Must specify the loader type as "spine"
   });

   // Create a new entity
   const spineEntity = new Entity(engine);

   // Add the SpineAnimationRenderer component
   const spine = spineEntity.addComponent(SpineAnimationRenderer);

   // Set the animation resource
   spine.resource = spineResource;

   // Add to the scene
   root.addChild(spineEntity);
   ```

### Loading Custom Uploaded Assets  

1. **Loading the assets**  

   If your Spine assets are uploaded via a third-party platform to a CDN rather than the Galacean Editor, you can still load them using the Galacean Spine runtime loader:

   ```typescript
   const resource = await engine.resourceManager.load({
     url: "https://your.spineboy.json", // Custom uploaded asset
     type: "spine", // Must specify the loader type as "spine"
   });
   ```

   When loading custom assets:  

   - **If passing a `url` parameter**, ensure the atlas and texture files are in the same directory as the skeleton file:  
     ```
     https://your.spineboy.json
     https://your.spineboy.atlas
     https://your.spineboy.png
     ```

   - **If passing `urls` (multiple links)**, the assets do not need to be in the same directory:
     ```typescript
     const resource = await engine.resourceManager.load({
       urls: [
         "https://your.spineboy.json",
         "https://another-path1.spineboy.atlas",
         "https://another-path2.spineboy.png",
       ],
       type: "spine", // Must specify the loader type as "spine"
     });
     ```

   - If the texture URL is not provided, the loader will extract the texture name from the atlas file and look for the texture in the same relative path as the atlas.

   - For assets without file extensions (e.g., blob URLs), append query parameters to the URLs:
     ```
     https://your.spineboyjson?ext=.json
     https://your.spineboyatlas?ext=.atlas
     ```

     Or specify `fileExtensions`:
     ```typescript
     const resource = await engine.resourceManager.load({
       urls: [
         "https://your.spineboyjson",
         "https://another-path1.spineboyatlas",
         "https://another-path2.spineboypng",
       ],
       type: "spine",
       fileExtensions: ["json", "atlas", "png"],
     });
     ```

   - If a texture atlas contains multiple images, provide the image URLs in the order they appear in the atlas file.

2. **Adding to the scene**  

   After loading, create an entity and add the `SpineAnimationRenderer` component:

   ```typescript
   import { SpineAnimationRenderer } from "@galacean/engine-spine";

   const spineResource = await engine.resourceManager.load({
     url: "https://your.spineboy.json", // Custom uploaded asset
     type: "spine",
   });

   // Create an entity
   const spineEntity = new Entity(engine);

   // Add SpineAnimationRenderer component
   const spine = spineEntity.addComponent(SpineAnimationRenderer);

   // Set the animation resource
   spine.resource = spineResource;

   // Add to the scene
   root.addChild(spineEntity);
   ```

---

## Using Runtime APIs  

In the [previous chapter](/docs/graphics/2D/spine/editor), we introduced the `SpineAnimationRenderer` component configuration in the editor.  
This section provides a more detailed guide on using the `SpineAnimationRenderer` component APIs in code.

---
