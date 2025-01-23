---
order: 2
title: Using in Code
type: Graphics
group: Spine
label: Graphics/2D/Spine/runtime
---

This chapter introduces how to use Galacean Spine in your code.

## Installation

Whether you are working with an exported project from the editor or a procode project, you need to install `@galacean/engine-spine` (the Galacean Spine runtime) to load and render Spine animations.
```typescript
npm install @galacean/engine-spine --save
```
After a successful installation, import it in your code:
```typescript
import { SpineAnimationRenderer } from "@galacean/engine-spine";
```
After installing and importing `@galacean/engine-spine`, the editor's `ResourceManager` will be able to recognize and load Spine animation assets.

## Load Assets and Add to Scene

### Load Assets Uploaded via the Galacean Editor
[After exporting the editor project](/docs/platform/platform/), `Spine animations already added to the scene will automatically load when the scene file is loaded`:

```typescript
// When loading scene files, Spine animations already added to the scene will be loaded automatically.
await engine.resourceManager.load({
  url: projectInfo.url,
  type: AssetType.Project,
});
```

<b>If not added to the scene, you need to load it manually in the code</b>. Follow these steps:
1. Copy the SkeletonDataAsset link.
Right-click on the SkeletonDataAsset, select `Copy relative path` to copy the asset path.
<img src="https://mdn.alipayobjects.com/huamei_kz4wfo/afts/img/A*muomS5hICRYAAAAAAAAAAAAADsp6AQ/original" />

2. Use ResourceManager to load

After obtaining the asset path, use the `resourceManager` to load it as shown below:
```typescript
import { SpineAnimationRenderer } from '@galacean/engine-spine';

// Load and obtain the spine resource
const spineResource = await engine.resourceManager.load({
  url: '/raptor.json', // The copied relative path
  type: 'Spine', // Specify the loader type as Spine
});
// Instantiate a Spine animation entity
const spineEntity = spineResource.instantiate();
// Add to the scene
root.addChild(spineEntity);
```
### Load custom uploaded assets
#### 1. Load assets

If your Spine assets were not uploaded via the Galacean editor but through a third-party platform to a CDN, you can still load them using the Galacean Spine runtime loader.
```typescript
const resource = await engine.resourceManager.load({
  url: 'https://your.spineboy.json', // Custom uploaded asset
  type: 'Spine', // Specify the loader type as Spine
});
```

When loading custom uploaded assets:
- If passing the parameter as `url`, <b>ensure the files are in the same directory</b>, such as:<br>
https://your.spineboy.json <br>
https://your.spineboy.atlas <br>
https://your.spineboy.png <br>

- If passing the parameter as `urls` (multiple links), the files do not need to be in the same directory:
```typescript
const resource = await engine.resourceManager.load({
  urls: [
    'https://your.spineboy.json',
    'https://ahother-path1.spineboy.atlas',
    'https://ahother-path2.spineboy.png',
  ],
  type: 'Spine', // Specify the loader type as Spine
});
```

- If no texture URL is provided, the loader will read the texture image name from the atlas file and look for the texture in the same directory as the atlas file.<br>
- If the custom uploaded asset lacks file extensions, you can add URL query parameters to the links, e.g.:<br>
https://your.spineboyjson?ext=.json, <br>
https://your.spineboyatlas?ext=.atlas <br>

- If the Spine animation atlas includes multiple images (e.g., a.png and b.png), follow the order recorded in the atlas file to pass the image URLs:
```typescript
const resource = await engine.resourceManager.load({
  urls: [
    'https://your.spineboy.json',
    'https://your.spineboy.atlas',
    'https://your.spineboy1.png', // Corresponds to a.png
    'https://your.spineboy2.png'  // Corresponds to b.png
  ],
  type: 'Spine', // Specify the loader type as Spine
});
```

#### 2. Add to the scene

After loading, instantiate a Spine animation entity and add it to the scene:
```typescript
import { SpineAnimationRenderer } from '@galacean/engine-spine';

const spineResource = await engine.resourceManager.load({
  url: 'https://your.spineboy.json', // Custom uploaded asset
  type: 'Spine',
});
// Instantiate a Spine animation entity
const spineEntity = spineResource.instantiate();
// Add to the scene
root.addChild(spineEntity);
```

## More Runtime APIs

In the [previous chapter](/docs/graphics/2D/spine/editor), we introduced the configuration options of the SpineAnimationRenderer component in the editor.
This section will explain in detail how to use each API of the SpineAnimationRenderer component in code.

The SpineAnimationRenderer component inherits from Renderer. In addition to exposing the common methods of Renderer, it provides the following properties:

| Property          | Description                                                                 |
| :---------------- | :-------------------------------------------------------------------------- |
| defaultConfig     | Default configuration. Corresponds to the editor's configuration options and is used to set the default animation and skin of Spine |
| state             | Animation state object. Used for more complex animation controls, such as queue playback, loop control, etc. |
| skeleton          | Skeleton object. Used for more complex skeleton operations, such as attachment replacement, skin switching, etc. |
| premultipliedAlpha | Premultiplied Alpha setting. Controls whether to enable premultiplied alpha mode during rendering |

### Default Configuration

In the script, you can use the `defaultConfig` parameter to set the default animation and skin for Spine:
```typescript
class YourAmazingScript {
  async onStart() {
    const spineResource = await engine.resourceManager.load({
      url: 'https://your.spineboy.json',
      type: 'Spine',
    });
    const spineEntity = spineResource.instantiate();
    const spine = spineEntity.getComponent(SpineAnimationRenderer);
    spine.defaultState.animationName = 'your-default-animation-name'; // Default animation name
    spine.defaultState.loop = true;  // Whether the default animation loops
    spine.defaultState.skinName = 'default';  // Default skin name
    rootEntity.addChild(spineEntity);  // Add to the scene
  }
}
```

Note: Default configuration only takes effect when the SpineAnimationRenderer component is active. To dynamically modify animations and skins, use the `state` and `skeleton` properties (explained in the following sections).

...

### Animation Control

In the script, you can obtain the [AnimationState](https://zh.esotericsoftware.com/spine-api-reference#AnimationState) object in the following way, which allows for more complex animation operations:

```typescript
class YourAmazingScript {
  onStart() {
    const spine = this.entity.getComponent(SpineAnimationRenderer);
    const { state } = spine; // AnimationState object
  }
}
```

#### **Play Animation**

First, let's introduce the most commonly used API: [setAnimation](https://zh.esotericsoftware.com/spine-api-reference#AnimationState-setAnimation)
```typescript
state.setAnimation(0, 'animationName', true);
```
The `setAnimation` function takes three parameters:

- `TrackIndex`: Animation track index
- `animationName`: Name of the animation
- `loop`: Whether to loop the animation

The second and third parameters are straightforward, while the first parameter introduces a concept in Spine animations: **Track**.

> When playing a Spine animation, an animation track must be specified. Using animation tracks, Spine can apply animations in layers. Each track stores animation and playback parameters, with track numbers starting from 0. When applying animations, Spine processes from lower to higher tracks, with higher tracks overriding animations on lower tracks.

#### **Animation Blending**

The above track override mechanism has many applications. For example, track 0 can have animations for walking, running, or swimming, while track 1 can contain a shooting animation that only has keyframes for the arms and firing. Additionally, setting the `TrackEntry.alpha` for higher tracks can blend them with lower tracks. For instance, track 0 could have a walking animation, and track 1 could have a limping animation. When the player is injured, increasing the `alpha` value of track 1 will intensify the limp.

For example:
```typescript
// The animation will now be walking while shooting
state.setAnimation(0, 'walk', true);
state.setAnimation(1, 'shoot', true);
```

#### **Animation Mixing**

Calling the `setAnimation` method switches the animation on the current track immediately. If you want a transition effect between animations, you need to set the duration of the transition. This can be done using the [AnimationStateData](https://zh.esotericsoftware.com/spine-api-reference#AnimationStateData) API:

```typescript
class YourAmazingScript {
  onStart() {
    const spine = this.entity.getComponent(SpineAnimationRenderer);
    const { state } = spine; // AnimationState object
    const { data } = state; // AnimationStateData object
    data.defaultMix = 0.2; // Set default transition duration
    data.setMix('animationA', 'animationB', 0.3); // Set transition duration between two specific animations
  }
}
```

- `defaultMix`: Default duration for transitions between animations without a defined duration
- `setMix`: Takes three parameters: the names of the two animations to set the transition duration, and the duration of the animation blend

...


#### **Animation Queue**

Spine also provides the [addAnimation](https://zh.esotericsoftware.com/spine-api-reference#AnimationState-addAnimation2) method to implement animation queue playback:
```typescript
state.setAnimation(0, 'animationA', false); // Play animation A on track 0
state.addAnimation(0, 'animationB', true, 0); // After animation A, add animation B and play it in a loop
```
The `addAnimation` method takes four parameters:

- `TrackIndex`: Animation track
- `animationName`: Name of the animation
- `loop`: Whether to play the animation in a loop
- `delay`: Delay time

The first three parameters are easy to understand, so let’s focus on the fourth parameter:
`delay` represents the duration of the preceding animation.

When `delay > 0` (e.g., `delay` is 1), the preceding animation switches to the next animation after playing for 1 second, as shown below:

<img src="https://mdn.alipayobjects.com/huamei_irlgws/afts/img/A*-sY9TrNI8L8AAAAAAAAAAAAADvX8AQ/original" width="350" alt="animation delay > 0">

If animation A’s duration is less than 1 second, it will either loop until 1 second or remain in its finished state until 1 second, depending on whether looping is enabled.

When `delay = 0`, the next animation plays immediately after the preceding animation finishes, as shown below:

<img src="https://mdn.alipayobjects.com/huamei_irlgws/afts/img/A*jk2VRaHwUXMAAAAAAAAAAAAADvX8AQ/original" width="350" alt="animation delay = 0">

Assuming animation A lasts 1 second and the transition duration is 0.2 seconds, animation B will transition starting at 0.8 seconds (1 - 0.2).

When `delay < 0`, the next animation begins before the preceding animation finishes, as shown below:
Similarly, if animation A lasts 1 second with a 0.2-second transition, animation B will begin transitioning at 0.6 seconds.

<img src="https://mdn.alipayobjects.com/huamei_irlgws/afts/img/A*1xJDTLr0ygAAAAAAAAAAAAAADvX8AQ/original" width="350" alt="animation delay < 0">

Besides `addAnimation`, the [addEmptyAnimation](https://zh.esotericsoftware.com/spine-api-reference#AnimationState-addEmptyAnimation) method can add an empty animation. Empty animations reset animations to their initial state.

`addEmptyAnimation` takes three parameters: `TrackIndex`, `mixDuration`, and `delay`. The `TrackIndex` and `delay` parameters are the same as those in `addAnimation`. The `mixDuration` parameter specifies the transition duration, and the animation will reset to its initial state over this duration. As shown below (the brown area on the right represents the empty animation):

<img src="https://mdn.alipayobjects.com/huamei_irlgws/afts/img/A*UdLBR4xoXAEAAAAAAAAAAAAADvX8AQ/original" width="267" alt="Add empty animation api">

...


#### **Track Parameters**

The `setAnimation` and `addAnimation` methods both return an object called `TrackEntry`. The `TrackEntry` object provides additional parameters for animation control. For example:

- `timeScale`: Controls the playback speed of the animation
- `animationStart`: Controls the start time of the animation
- `alpha`: Blending factor for the current animation on the track
- ...

For more details on these parameters, refer to the [TrackEntry official documentation](https://zh.esotericsoftware.com/spine-api-reference#TrackEntry).

#### **Animation Events**

<img src="https://mdn.alipayobjects.com/huamei_irlgws/afts/img/A*j4SmSKjherYAAAAAAAAAAAAADvX8AQ/original" width="681" alt="Animation event diagram">

When controlling animations via the `AnimationState` API, various events, as shown above, can be triggered.
- When a new animation starts, the `Start` event is triggered.
- When an animation is removed from the queue or interrupted, the `End` event is triggered.
- When an animation finishes, regardless of whether it loops, the `Complete` event is triggered.

For a complete list of events and detailed explanations, refer to the [Spine animation events official documentation](https://zh.esotericsoftware.com/spine-unity-events).

These events can be listened to using the [AnimationState.addListener](https://zh.esotericsoftware.com/spine-api-reference#AnimationState-addListener) method.

```typescript
class YourAmazingScript {
  onStart() {
    const spine = this.entity.getComponent(SpineAnimationRenderer);
    const { state } = spine; // AnimationState object
    state.addListener({
      start: (entry: TrackEntry) => {
        // Callback function
      },
      complete: (entry: TrackEntry) => {
        // Callback function
      },
      end: (entry: TrackEntry) => {
        // Callback function
      },
      interrupt: (entry: TrackEntry) => {
        // Callback function
      },
      dispose: (entry: TrackEntry) => {
        // Callback function
      },
      event: (entry: TrackEntry) => {
        // Callback function
      },
    });
  }
}
```

### Skeleton Operations

In your script, you can access the [Skeleton](https://zh.esotericsoftware.com/spine-api-reference#Skeleton) object to manipulate bones, slots, attachments, etc.

```typescript
class YourAmazingScript {
  onStart() {
    const spine = this.entity.getComponent(SpineAnimationRenderer);
    const { skeleton } = spine; // Skeleton object
  }
}
```

The following are some common operations:

#### **Modify Bone Position**

The `Skeleton` API allows you to modify the positions of Spine bones, which can be useful for implementing effects like aiming or following by setting the target bone for IK.

```typescript
class YourAmazingScript {
  onStart() {
    const spine = this.entity.getComponent(SpineAnimationRenderer);
    const { skeleton } = spine; // Skeleton object
    const bone = skeleton.findBone('aim-target');
    bone.x = targetX;
    bone.y = targetY;
  }
}
```

Note: Since animations affect bone positions, modifications to bone positions should be made after the animation is applied, such as in the `onLateUpdate` lifecycle of your script.

#### **Replace Attachments**

The `Skeleton` API also allows you to replace [attachments](https://zh.esotericsoftware.com/spine-attachments) within [slots](https://zh.esotericsoftware.com/spine-slots). By switching attachments, you can achieve localized outfit changes.

```typescript
class YourAmazingScript {
  onStart() {
    const spine = this.entity.getComponent(SpineAnimationRenderer);
    const { skeleton } = spine; // Skeleton object
    // Find slot by name
    const slot = skeleton.findSlot('slotName');
    // Get attachment by name from the skeleton's skin or default skin
    const attachment = skeleton.getAttachment(slot.index, 'attachmentName');
    // Set the attachment for the slot
    slot.attachment = attachment;
    // Or set the slot attachment using the skeleton's setAttachment method
    skeleton.setAttachment('slotName', 'attachmentName');
  }
}
```

Note: Similar to bone positions, attachment replacement should occur after the animation is applied, such as in the `onLateUpdate` lifecycle.

...


#### **Skin Switching and Mixing**

**Skin Switching**

You can switch the entire skin using the [setSkin](https://zh.esotericsoftware.com/spine-api-reference#Skeleton-setSkin) API of the `Skeleton`.

```typescript
class YourAmazingScript {
  onStart() {
    const spine = this.entity.getComponent(SpineAnimationRenderer);
    const { skeleton } = spine; // Skeleton object
    // Set the skin by name
    skeleton.setSkinByName("full-skins/girl");
    // Reset to the initial position (this must be called, or rendering might appear incorrect)
    skeleton.setSlotsToSetupPose();
  }
}
```

**Skin Mixing**

In the Spine editor, designers can prepare skins for each appearance and equipment item, then combine them into a new skin at runtime. The following code demonstrates how to add selected skins using `addSkin`:

```typescript
class YourAmazingScript {
  onStart() {
    const spine = this.entity.getComponent(SpineAnimationRenderer);
    const { skeleton } = spine; // Skeleton object
    const mixAndMatchSkin = new spine.Skin("custom-girl");
    mixAndMatchSkin.addSkin(skeletonData.findSkin("skin-base"));
    mixAndMatchSkin.addSkin(skeletonData.findSkin("nose/short"));
    mixAndMatchSkin.addSkin(skeletonData.findSkin("eyelids/girly"));
    mixAndMatchSkin.addSkin(skeletonData.findSkin("eyes/violet"));
    mixAndMatchSkin.addSkin(skeletonData.findSkin("hair/brown"));
    mixAndMatchSkin.addSkin(skeletonData.findSkin("clothes/hoodie-orange"));
    mixAndMatchSkin.addSkin(skeletonData.findSkin("legs/pants-jeans"));
    mixAndMatchSkin.addSkin(skeletonData.findSkin("accessories/bag"));
    mixAndMatchSkin.addSkin(skeletonData.findSkin("accessories/hat-red-yellow"));
    this.skeleton.setSkin(mixAndMatchSkin);
  }
}
```

The skin names used in the code come from the mix-and-match example, which you can see in the next chapter.

#### **Dynamically Load Atlases and Replace Attachments**

In traditional Spine projects, different skins are usually packed into the same atlas. However, as the number of skins increases, the growing number of textures in the atlas can lead to longer loading times. To address this issue, you can dynamically load additional atlas files at runtime and create new attachments based on the new atlas to replace the original attachments. This approach supports large-scale skin expansions while avoiding initial load performance issues.

For example, you can pack weapons, headgear, and glasses into a separate atlas and replace them at runtime.

```typescript
class YourAmazingScript {
  async onStart() {
    // Load additional atlas files
    const extraAtlas = await this.engine.resourceManager.load('/extra.atlas') as TextureAtlas;
    const { skeleton } = this.entity.getComponent(SpineAnimationRenderer);
    // The slot containing the attachment to be replaced
    const slot = skeleton.findSlot(slotName);
    // The region in the new atlas used to create a new attachment
    const region = extraAtlas.findRegion(regionName);
    // Clone a new attachment from the original, using the region from the new atlas
    const clone = this.cloneAttachmentWithRegion(slot.attachment, region);
    // Replace the attachment
    slot.attachment = clone;
  }

  // Attachment cloning method
  cloneAttachmentWithRegion(
    attachment: RegionAttachment | MeshAttachment | Attachment,
    atlasRegion: TextureAtlasRegion,
  ): Attachment {
    let newAttachment: RegionAttachment | MeshAttachment;
    switch (attachment.constructor) {
      case RegionAttachment:
        newAttachment = attachment.copy() as RegionAttachment;
        newAttachment.region = atlasRegion;
        newAttachment.updateRegion();
        break;
      case MeshAttachment:
        const meshAttachment = attachment as MeshAttachment;
        newAttachment = meshAttachment.newLinkedMesh();
        newAttachment.region = atlasRegion;
        newAttachment.updateRegion();
        break;
      default:
        return attachment.copy();
    }
    return newAttachment;
  }
}
```

The next chapter will showcase [Spine Examples and Templates](/en/docs/graphics/2D/spine/example).
