---
order: 5
title: Sprite Atlas
type: Graphics
group: 2D
label: Graphics/2D
---

[SpriteAtlas](/apis/core/#SpriteAtlas) is a collection of sprites that combines multiple sprite textures into one sprite atlas to merge drawing commands during rendering. It has the following advantages:

- Better performance (merge drawing commands);
- Less memory usage (packing algorithm reduces texture size);
- Fewer requests (reduce loading requests by reducing fragmented files);

In the example below, only one drawing command is called per frame in the sprite atlas:

<playground src="sprite-atlas.ts"></playground>

## Editor Usage

### Create Sprite Atlas

Right-click inside the **[Asset Panel](/en/docs/assets-interface)**, select `Create` from the `Feature List`, and choose `Sprite Atlas`. This will create an empty sprite atlas asset.

<img src="https://mdn.alipayobjects.com/huamei_w6ifet/afts/img/A*W-HZSrvAiG8AAAAAAAAAAAAADjCHAQ/original" alt="buildBox" style="zoom: 67%;" />

Select the `Sprite Atlas` asset to view detailed information in the **[Inspector Panel](/en/docs/interface/inspector)**.

<img src="https://mdn.alipayobjects.com/huamei_w6ifet/afts/img/A*LW0JS7v5dP8AAAAAAAAAAAAADjCHAQ/original" alt="buildBox" style="zoom: 67%;" />

### Add Sprites

After determining the relationship between the `Sprite Atlas` and `Sprites`, you need to add the `Sprites` to the corresponding `Sprite Atlas`. This can be done by operating the `Sprite` asset or the `Sprite Atlas` asset. The following explains both methods.

#### Method 1: Operate Sprite

Left-click on the `Sprite` asset that needs to be added, and in the **[Inspector Panel](/en/docs/interface/inspector)**, find the `Hierarchy` of the sprite. Select `Pack into Atlas` to choose the desired `Sprite Atlas` asset to pack into.

<img src="https://mdn.alipayobjects.com/huamei_w6ifet/afts/img/A*G_utQZfPYPoAAAAAAAAAAAAADjCHAQ/original" alt="buildBox" style="zoom: 67%;" />

#### Method 2: Operate Sprite Atlas

Left-click on the target `Sprite Atlas` asset, and in the **[Inspector Panel](/en/docs/interface/inspector)**, find the list of sprites packed in the atlas. Select `Add Sprite` to choose the desired `Sprite` asset to pack (selecting a folder will add all sprites under that folder).

<img src="https://mdn.alipayobjects.com/huamei_w6ifet/afts/img/A*6unHT7e-S-8AAAAAAAAAAAAADjCHAQ/original" alt="buildBox" style="zoom: 67%;" />

### Remove Sprites

#### Method 1: Operate Sprite

Left-click on the `Sprite` asset that needs to be removed from the atlas, and in the **[Inspector Panel](/en/docs/interface/inspector)**, find the sprite's `Hierarchy` (make sure the path of the target atlas matches). Click the remove button to remove the sprite from the target atlas.

<img src="https://mdn.alipayobjects.com/huamei_jvf0dp/afts/img/A*dQ_CT5qjHacAAAAAAAAAAAAADleLAQ/original" alt="buildBox" style="zoom: 67%;" />

#### Method 2: Operate Sprite Atlas

Left-click on the `Sprite Atlas` asset to be operated, and in the **[Inspector Panel](/en/docs/interface/inspector)**, find the list of sprites in the atlas. Locate the sprite to be removed and click the remove button.

<img src="https://mdn.alipayobjects.com/huamei_w6ifet/afts/img/A*aZcoS6ISXAoAAAAAAAAAAAAADjCHAQ/original" alt="buildBox" style="zoom: 67%;" />

### Quickly Operate Sprites

After a `Sprite` asset is added to a `Sprite Atlas`, you can quickly operate the sprite in the `Sprite Atlas` **[Inspector Panel](/en/docs/interface/inspector)**, and its properties will be synchronized with the `Sprite` asset.


### Settings

#### Packaging Settings

<img src="https://gw.alipayobjects.com/zos/OasisHub/81a2044b-c1b7-449d-96cf-1e098b72a1be/image-20231208165843716.png" alt="image-20231208165843716" style="zoom:50%;" />

| Setting Name       | Definition                                |
| ------------------ | ---------------------------------------- |
| Texture Max Width       | Maximum width limit of the packed texture               |
| Texture Max Height       | Maximum height limit of the packed texture               |
| Edge Padding           | Padding width for the sprite packing                   |
| Allow Rotation (Disabled) | Whether to improve the space utilization of the atlas packing through rotation     |
| Trim Blank Space (Disabled) | Whether to improve the space utilization of the atlas packing through blank space trimming |

#### Export Settings

<img src="https://gw.alipayobjects.com/zos/OasisHub/1f4302b8-d485-4d3e-b508-36b570f5a883/image-20231208165430415.png" alt="image-20231208165430415" style="zoom:50%;" />

| Property                                                            | Value                                                                                                                                                                                         |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Wrap Mode U ([wrapModeU](/apis/core/#Texture-wrapModeU))         | Clamping Mode ([Clamp](/apis/core/#TextureWrapMode-Clamp)), Repeating Mode ([Repeat](/apis/core/#TextureWrapMode-Repeat)), Mirrored Repeat Mode ([Mirror](/apis/core/#TextureWrapMode-Mirror))               |
| Wrap Mode V ([wrapModeV](/apis/core/#Texture-wrapModeV))         | Clamping Mode ([Clamp](/apis/core/#TextureWrapMode-Clamp)), Repeating Mode ([Repeat](/apis/core/#TextureWrapMode-Repeat)), Mirrored Repeat Mode ([Mirror](/apis/core/#TextureWrapMode-Mirror))               |
| Filter Mode ([filterMode](/apis/core/#Texture-filterMode))         | Point Filtering ([Point](/apis/core/#TextureFilterMode-Point)), Bilinear Filtering ([Bilinear](/apis/core/#TextureFilterMode-Bilinear)), Trilinear Filtering ([Trilinear](/apis/core/#TextureFilterMode-Trilinear)) |
| Anisotropic Filtering Level ([anisoLevel](/apis/core/#Texture-anisoLevel)) | Anisotropic level, 1 ~ 16                                                                                                                                                                       |
| Texture Mapping ([Mipmap](/apis/core/#Texture-generateMipmaps))         | true , false                                                                                                                                                                               |

### Best Practices {#best-practices}

Click on the `Sprite Atlas` asset, adjust the `Texture Max Width` and `Texture Max Height` in the `Pack Settings`, and call `Pack and Preview` in the `Pack Objects` to ensure the utilization of the atlas is at a relatively high level.

![image-20210901171947471](https://mdn.alipayobjects.com/huamei_w6ifet/afts/img/A*lyhRSY63HJgAAAAAAAAAAAAADjCHAQ/original)

The left side of the preview image shows the size information of the exported images, while the right side shows the information about the utilization of the atlas (representing the percentage of the sum of all individual image areas occupying the final large image). You can adjust the packing settings based on this value to achieve better results.

## Script Usage {#script-usage}

### Atlas Generation

Galacean provides a command-line tool for sprite atlas, developers can generate atlases following these steps:

1. Install the package

```bash
npm i @galacean/tools-atlas -g
```

2. Execute the packing command

```bash
galacean-tool-atlas p inputPath -o outputName
```

Where `inputPath` represents the folder path that needs to be packed, and `outputName` represents the output sprite atlas file name. If you get the result shown below, it means the packing was successful.

<img src="https://gw.alipayobjects.com/mdn/rms_7c464e/afts/img/A*UhLBRpt9SwAAAAAAAAAAAAAAARQnAQ" alt="image.png" style="zoom:75%;" />

| Property       | Description                                 |
| -------------- | ------------------------------------------- |
| f/format       | Sprite atlas format for packing (default: "galacean") |
| o/output       | Output sprite atlas file name (default: "galacean") |
| a/algorithm    | Algorithm for packing sprite atlas (default: "maxrects") |
| ar/allowRotate | Whether the sprite atlas supports rotation (default: false) |
| p/padding      | Distance between each sprite in the atlas and its border (default: 1) |
| mw/maxWidth    | Maximum width of the final sprite atlas (default: 1024) |
| mh/maxHeight   | Maximum height of the final sprite atlas (default: 1024) |
| s/square       | Force packing into a square (default: false) |
| pot            | Force packing into power of 2 (default: false) |

For more information, please refer to the [Atlas Packing Tool](https://github.com/galacean/tools/blob/main/packages/atlas/README.md).

### Usage

1. Upload the atlas image and atlas file to the same directory on CDN, for example, the addresses of the file and image should be `https://*cdnDir*/*atlasName*.atlas` and `https://*cdnDir*/*atlasName*.png` respectively.

2. Load and Use

```typescript
engine.resourceManager
  .load<SpriteAtlas>({
    url: "https://*cdnDir*/*atlasName*.atlas",
    type: AssetType.SpriteAtlas,
  })
  .then((atlas) => {
    // Get all sprites.
    const allSprites = atlas.sprites;
    // Get sprite by spriteName.
    atlas.getSprite("spriteName");
    // If multiple sprites have the same name, we can get all like this.
    const allSpritesWithSameName = atlas.getSprites("spriteName", []);
  });
```

## Notes {#notes}

1. Pack sprites that are drawn in sequence into the same atlas to significantly improve performance (reduce the number of draw command calls);
2. When cleaning up sprite atlases, make sure that all sprites in the atlas are no longer in use;
3. When packing sprite atlases, it is necessary to coordinate the number and size of sprites to avoid generating multiple sprite atlases at once;
