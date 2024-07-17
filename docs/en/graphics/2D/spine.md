---
order: 7
title: Spine
type: Graphics
group: 2D
label: Graphics/2D
---

Spine animation is a `2D skeletal animation` tool designed for game development. It binds images to skeletons and controls the animation by manipulating the skeletons. Spine provides both the `control` and `flexibility` needed for animations, offering a more `efficient` and `concise` workflow for programmers, artists, and designers.

|        | Visuals | Performance | File Size | Flexibility | Ease of Use | Free?    |
| ------ | ------- | ----------- | --------- | ----------- | ----------- | -------- |
| Spine  | Optimal | Good        | Optimal   | Optimal     | Most complex| Paid     |
| Lottie | Good    | Poor        | Good      | Good        | Good        | Free     |
| Frame Animation | Poor | Optimal | Poor | Poor | Simplest | Free |

Spine animation supports skinning, animation blending, and bone control through code.

## Using in Editor

Using Spine in the editor involves the following steps:

```mermaid
flowchart LR
   Export Resources --> Upload Resources --> Add Component --> Write Script
```

### Export Resources

Download [Spine Editor](https://zh.esotericsoftware.com/) and create animations in version 3.8 (only version 3.8 is currently supported). Use the export feature in the Spine editor to export the necessary resource files. After exporting, you will find resource files in .json (or .bin), atlas, and png formats in the target folder. [Click here to download sample files](https://mdn.alipayobjects.com/portal_h1wdez/afts/file/A*uhFUSbeI5z0AAAAAAAAAAAAAAQAAAQ)

> Galacean Spine runtime currently only supports loading a single texture, so if the texture size is too large, you need to scale the image resource to fit within a single texture. For detailed export configurations, refer to the Spine official documentation: [http://zh.esotericsoftware.com/spine-export](http://zh.esotericsoftware.com/spine-export/)

### Upload Resources

After exporting resources, developers need to upload the three files to the Galacean Editor. Use the upload button in the **[Asset Panel](/en/docs/assets-interface)** to select the "spine" asset and upload the three local files. Once uploaded successfully, you can see the uploaded spine asset in the asset panel:
<img src="https://mdn.alipayobjects.com/huamei_kz4wfo/afts/img/A*OYpQSIgQi8UAAAAAAAAAAAAADsp6AQ/original"  style="zoom:50%;" />

You can also drag and drop the three files directly into the asset area for upload:
<img src="https://mdn.alipayobjects.com/huamei_kz4wfo/afts/img/A*ZQi1SasPBGUAAAAAAAAAAAAADsp6AQ/original"  style="zoom:50%;" />

After uploading, you will see the uploaded spine material in the Asset Panel:
<img src="https://mdn.alipayobjects.com/huamei_kz4wfo/afts/img/A*5HacQrZQQA8AAAAAAAAAAAAADsp6AQ/original"  style="zoom:30%;" />

### Add Component

After uploading resources, add a spine rendering node (a node with a SpineRenderer component) in the left node tree of the editor. Select the uploaded asset as the resource and choose the animation name to play the spine animation (defaults to the first if not selected).

![spine](https://mdn.alipayobjects.com/huamei_w6ifet/afts/img/A*tqm4R51gYxEAAAAAAAAAAAAADjCHAQ/original)

The properties of the Spine rendering component are as follows:

| Property    | Description                                      |
| :---------- | :----------------------------------------------- |
| `Resource`  | Select the Spine asset                           |
| `AutoPlay`  | Whether to autoplay the animation                |
| `loop`      | Whether to loop the animation                    |
| `Animation` | Name of the animation                            |
| `SkinName`  | Name of the skin                                 |
| `Scale`     | Scale of the animation                           |
| `priority`  | Rendering priority, the smaller the value, the higher the priority, and the earlier it is rendered |


### Writing Scripts


If additional logic needs to be applied to spine animations, the editor's scripting functionality must be utilized. Create a script resource and add a script component to the node created in the previous section, then select the created script.
![image](https://mdn.alipayobjects.com/huamei_kz4wfo/afts/img/A*0FhvS6askHoAAAAAAAAAAAAADsp6AQ/original){: style="zoom:40%;"}

Double-click on the script in the asset panel or click the edit button of the script component to enter the script editor. In the script editor, you can access the spine rendering component from the current entity and perform more operations using the component's API. For example, actively playing a specific animation:
![image](https://mdn.alipayobjects.com/huamei_kz4wfo/afts/img/A*UYX6RYDYrFQAAAAAAAAAAAAADsp6AQ/original){: style="zoom:40%;"}

For more detailed APIs, please refer to the following section.

## Using in Code

### Installation


First, manually add [@galacean/engine-spine](https://github.com/galacean/engine-spine) as a third-party package.

```bash
npm i @galacean/engine-spine --save
```

### Resource Export


After installing the third-party package, similar to using it in the editor, you need to download the [Spine Editor](https://zh.esotericsoftware.com/) and create animations in version 3.8 (currently only supports version 3.8). By using the export feature of the Spine editor, you can export the required resource files. After exporting, you will see .json (or .bin), atlas, and png resource files in the target folder. [Click here to download an example file](https://mdn.alipayobjects.com/portal_h1wdez/afts/file/A*uhFUSbeI5z0AAAAAAAAAAAAAAQAAAQ)

### Resource Loading


In the code, after importing _@galacean/engine-spine_, the resource loader for spine resources will be automatically registered on the [engine]($%7Bapi%7Dcore/Engine)'s [resourceManager]($%7Bapi%7Dcore/Engine#resourceManager). You can load spine animation resources using the resourceManager's [load]($%7Bapi%7Dcore/ResourceManager/#load) method.

- When passing a URL as a parameter, the spine animation resource will have the same base URL by default, so you only need to pass the CDN of the json (or bin) file.
- When passing an array of URLs as a parameter, you need to pass the CDNs of the json (or bin), atlas, and image (png, jpg) resources.
- The resource type must be specified as spine.

After loading, a SpineResource will be returned. You need to create a node, add a Spine renderer, and set the renderer's resource to the returned SpineResource. Refer to the code example below:

<playground src="spine-animation.ts"></playground>

### Playing Animations


The Spine renderer (SpineRenderer) provides various methods for playing animations.

1. Play using the animationName, autoPlay, and loop properties. When setting the animationName to the desired animation name and autoPlay to true, the corresponding animation will play automatically. The loop property controls whether the animation loops.

```javascript
const spineRenderer = spineEntity.getComponent(SpineRenderer);
spineRenderer.animationName = "idle";
spineRenderer.autoPlay = true;
spineRenderer.loop = true;
```

2. Play using the play method. The play method supports passing the animation name and a boolean for looping.

```javascript
const spineRenderer = spineEntity.getComponent(SpineRenderer);
spineRenderer.play("idle", true);
```

3. By accessing the spineAnimation property, you can obtain the [AnimationState](http://zh.esotericsoftware.com/spine-api-reference#AnimationState) and [Skeleton](http://zh.esotericsoftware.com/spine-api-reference#Skeleton) interfaces of the spine, allowing you to use the spine-core native API to play animations.

```javascript
const spineRenderer = spineEntity.getComponent(SpineRenderer);
spineRenderer.spineAnimation.state.setAnimation(0, "idle", true);
```

#### Animation Control {/examples}

By using the AnimationState object exposed by the SpineRenderer's spineAnimation, you can control animations, such as looping animations, pausing animation playback, and more. You can refer to the example below for reference.
For detailed API information, please refer to the official documentation of AnimationState: [http://zh.esotericsoftware.com/spine-api-reference#AnimationState](http://zh.esotericsoftware.com/spine-api-reference#AnimationState)

### Animation Event Mechanism {/examples}

Spine also provides events to facilitate development. The mechanism of animation events is illustrated in the following diagram:
![](https://gw.alipayobjects.com/mdn/mybank_yul/afts/img/A*fC1NT5tTET8AAAAAAAAAAAAAARQnAQ#crop=0&crop=0&crop=1&crop=1&id=JUZeZ&originHeight=280&originWidth=640&originalType=binary&ratio=1&rotation=0&showTitle=false&status=done&style=none&title=)
For detailed documentation, please visit: [http://esotericsoftware.com/spine-unity-events](http://esotericsoftware.com/spine-unity-events)
By using the addListener method of AnimationState, you can add callback methods when different events are triggered.

### Skin Change {/examples}

There are multiple methods available at runtime for skin changes. The simplest way is to change the skin using the skinName property of the SpineRenderer.

```javascript
const spineRenderer = spineEntity.getComponent(SpineRenderer);
spineRenderer.skinName = "skin1";
```

You can also change the skin using the spine-core native API. Please refer to the example below:
<playground src="spine-skin-change.ts"></playground>

#### Attachment Replacement {/examples}

By using the native API, you can replace attachments in Spine to achieve partial outfit changes. Please refer to the example below:
<playground src="spine-change-attachment.ts"></playground>

#### Slot Separation {/examples}

The spine component merges all vertices of the spine animation into a `Mesh`. By using the `addSeparateSlot` method, you can separate a specified slot into individual `SubMeshes`, and then use the `hackSeparateSlotTexture` method to replace the material of the separated slot. This method can also achieve partial outfit changes. Please refer to the example below:

<playground src="spine-hack-slot-texture.ts"></playground>
