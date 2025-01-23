---
order: 1
title: Using in the Editor
type: Graphics
group: Spine
label: Graphics/2D/Spine/editor
---

The Galacean editor has built-in support for Spine animations, requiring no additional downloads or configurations, making the development process significantly easier. This chapter introduces how to use Spine animations in the Galacean editor.

> For editor version dependencies, please refer to: [Version/Performance Section](/docs/graphics/2D/spine/other)


## 1. Exporting Assets from the Spine Editor
The first step is to export your Spine animation assets from the Spine editor. You can find the complete steps in the ["Spine User Guide"](https://zh.esotericsoftware.com/spine-user-guide), which explains how to:

1. [Export skeleton and animation data](https://zh.esotericsoftware.com/spine-export)
2. [Export texture atlases containing skeleton images](https://zh.esotericsoftware.com/spine-texture-packer)

Below is a brief overview of the Spine asset export process:

1. After completing the animation, click `Spine Menu` > `Export` to open the export window.

<img src="https://mdn.alipayobjects.com/huamei_irlgws/afts/img/A*AhJWTLotiKUAAAAAAAAAAAAADvX8AQ/original" width="203" alt="Export panel in Spine editor" />

2. In the upper left corner of the export window, select **Binary** (recommended to export in binary format instead of JSON format, as it results in smaller file sizes and faster loading).

<img src="https://mdn.alipayobjects.com/huamei_irlgws/afts/img/A*SLgpQr7P8FIAAAAAAAAAAAAADvX8AQ/original" width="551" alt="Export window in Spine editor" />

3. Check the **Texture Atlas** packing checkbox.

<img src="https://mdn.alipayobjects.com/huamei_irlgws/afts/img/A*lryOSrLjzEYAAAAAAAAAAAAADvX8AQ/original" width="549" alt="Click packing texture atlas button in Export window" />

4. Click **Packing Settings**.

The packing settings refer to the texture packing configurations. Refer to the [official documentation](https://zh.esotericsoftware.com/spine-texture-packer) for detailed parameters. After completing the packing settings, click **OK**.

<img src="https://mdn.alipayobjects.com/huamei_kz4wfo/afts/img/A*fpulR7_CCisAAAAAAAAAAAAADsp6AQ/original" width="521" alt="Texture pack window in Spine Editor" />

5. Return to the export window, select the export folder, and click **Export**.

<img src="https://mdn.alipayobjects.com/huamei_irlgws/afts/img/A*Tv0uRpXYT-gAAAAAAAAAAAAADvX8AQ/original" width="519" alt="Click export button in texture pack window" />

6. You will get the following three files:

<img src="https://mdn.alipayobjects.com/huamei_irlgws/afts/img/A*2eL6R51ITuAAAAAAAAAAAAAADvX8AQ/original" width="406" alt="Spine assets in folder" />

- spineboy.skel: Contains skeleton and animation data, the core information for binding animation actions to the skeleton.
- spineboy.atlas: Stores information about the texture atlas, including the position and size of each texture in the atlas.
- Texture images: These may include multiple images, with each representing a page in the texture atlas used for rendering the visual content of animated characters.

## 2. Importing Assets into the Galacean Editor
The second step is to import the files exported from the Spine editor into the Galacean editor.

After opening the editor, drag the exported files directly into the [Assets Panel](/docs/assets/interface/) to upload them, as shown in the following GIF:

<img src="https://mdn.alipayobjects.com/huamei_irlgws/afts/img/A*u-FHQYyaXlgAAAAAAAAAAAAADvX8AQ/original" width="992" alt="Drag spine assets into Galacean editor"/>

You can also click the upload button in the assets panel and select the files to upload:

<img src="https://mdn.alipayobjects.com/huamei_irlgws/afts/img/A*KaxcS6O7M5EAAAAAAAAAAAAADvX8AQ/original" width="1507" alt="Use upload button to upload spine assets" />
</br>

Once uploaded, you will see the uploaded Spine assets in the assets panel, including: <b>SpineSkeletonData assets</b>, <b>SpineAtlas assets</b>, and texture assets.

### SpineSkeletonData Asset

<img src="https://mdn.alipayobjects.com/huamei_irlgws/afts/img/A*-U5CRKWiRlsAAAAAAAAAAAAADvX8AQ/original" width="110" alt="Spine skeleton data asset icon" />

The SpineSkeletonData asset stores skeleton data and references to the generated SpineAtlas asset. By clicking the asset, you can preview the Spine animation in the inspector, where you can switch between `Skin` and `Animation Clips` in the preview panel:

<img src="https://mdn.alipayobjects.com/huamei_irlgws/afts/img/A*AXsDRognlqMAAAAAAAAAAAAADvX8AQ/original" width="478" alt="Spine skeleton data preview" />

### SpineAtlas Asset

<img src="https://mdn.alipayobjects.com/huamei_irlgws/afts/img/A*OGNbSaCYQlwAAAAAAAAAAAAADvX8AQ/original" width="108" alt="Spine atlas asset" />

The SpineAtlas asset stores the texture atlas file and contains references to the required texture assets. By clicking the asset, you can view its referenced texture assets and atlas information in the inspector.

<img src="https://mdn.alipayobjects.com/huamei_irlgws/afts/img/A*-j8aSq7wSVAAAAAAAAAAAAAADvX8AQ/original" width="468" alt="Spine atlas preview" />

### Updating Assets
If you need to update your Spine assets, re-export the assets from the Spine editor and import them into the Galacean editor to overwrite the existing files.


## 3. Adding Spine Animations

After uploading the assets, you can add Spine animations to the scene using the following three methods:

### Drag-and-Drop

Drag-and-drop is the quickest method. Click the SpineSkeletonData asset, hold and drag it into the viewport to quickly create an entity with the SpineAnimationRenderer component and specify the selected SpineSkeletonData asset.

<img src="https://mdn.alipayobjects.com/huamei_irlgws/afts/img/A*2s_oTZ4sIU0AAAAAAAAAAAAADvX8AQ/original" width="992" alt="Drag Spine skeleton data asset into viewport"/>

### Quick Add

Click the quick add button in the upper left corner and select `2D Object` > `SpineAnimationRenderer`.

<img src="https://mdn.alipayobjects.com/huamei_irlgws/afts/img/A*NbafRIIuvuAAAAAAAAAAAAAADvX8AQ/original" width="1507" alt="Quick add Spine animation renderer"/>

After adding, you will see a new entity with the SpineAnimationRenderer component. Click the Resource property and select the uploaded SpineSkeletonData asset to see the Spine animation.

<img src="https://mdn.alipayobjects.com/huamei_irlgws/afts/img/A*WyOtTJBu98MAAAAAAAAAAAAADvX8AQ/original" width="1500" alt="Select spine skeleton data asset in component panel"/>

### Manual Add

The manual method is similar to quick add but requires manually creating a new entity in the node tree and adding the SpineAnimationRenderer component via the AddComponent button in the inspector.

<img src="https://mdn.alipayobjects.com/huamei_irlgws/afts/img/A*PO1FQ7rjMOkAAAAAAAAAAAAADvX8AQ/original" width="342" alt="Use add component to add spine animation renderer"/>

After adding the SpineAnimationRenderer component, you also need to specify the component's Resource, which is the SpineSkeletonData asset that the SpineAnimationRenderer component will render.

### SpineAnimationRenderer Component Configuration

All three methods for adding Spine animations are essentially the same: by adding the SpineAnimationRenderer component to an entity to incorporate Spine animations into the scene.

The SpineAnimationRenderer component configuration is as follows:

<img src="https://mdn.alipayobjects.com/huamei_irlgws/afts/img/A*afilTpuoSmwAAAAAAAAAAAAADvX8AQ/original" width="503" alt="Spine animation renderer component config"/>

Using the SpineAnimationRenderer component, you can configure the Spine animation assets and default states:

- Resource: The resource for the Spine animation (SpineSkeletonData asset)
- Animation: The default animation name to play
- Loop: Whether the default animation plays in a loop
- Skin: The default skin name
- Priority: Render priority
- PremultiplyAlpha: Whether to render the animation in premultiplied alpha mode

## 4. Project Export

Finally, after completing scene editing, you can refer to the [Project Export](/en/docs/platform/platform/) process to export the editor project.

Next section: [Using Galacean Spine Runtime in Your Code](/en/docs/graphics/2D/spine/runtime)
</br></br></br></br>
Next Chapter: [Using in Code](/en/docs/graphics/2D/spine/runtime)
