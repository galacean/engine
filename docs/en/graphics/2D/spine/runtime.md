---
order: 2
title: Using in Code
type: Graphics
group: Spine
label: Graphics/2D/Spine/runtime
---

This chapter introduces how to use the Galacean Spine runtime in your code.

## Installation
Whether the project is exported from the editor or a procode project, you need to install `@galacean/engine-spine` (the Galacean Spine runtime) to load and render Spine animations.
```typescript
npm install @galacean/engine-spine --save
```
After installation, import it in your code:
```typescript
import { SpineAnimationRenderer } from "@galacean/engine-spine";
```
Once `@galacean/engine-spine` is installed and imported, the editor's `resourceManager` can recognize and load Spine animation assets.
The Galacean Spine loader supports both assets uploaded via the editor and custom-uploaded assets.

## Load Assets and Add Them to the Scene

### Load Assets Uploaded via the Galacean Editor
[After exporting the editor project](/docs/assets/build/), `Spine animations already added to the scene will automatically load when the scene file is loaded`:

```typescript
// Spine animations already added to the scene will automatically load when loading the scene file
await engine.resourceManager.load({
  url: projectInfo.url,
  type: AssetType.Project,
})
```

<b>If not added to the scene, you need to load it manually in the code</b>, as follows:
1. First, download the editor project.

Note: The `Upload Assets to CDN` option determines whether the animation is loaded via a CDN link or using a local file's relative path.

<img src="https://mdn.alipayobjects.com/huamei_kz4wfo/afts/img/A*0rZJQJRNamIAAAAAAAAAAAAADsp6AQ/original" width="260" alt="Project export panel">

2. Locate the Spine asset file.

After downloading the project locally, open the `project.json` file and find the `url` property.

If `Upload Assets to CDN` was checked, you can find the Spine asset link in the JSON file:
<img src="https://mdn.alipayobjects.com/huamei_kz4wfo/afts/img/A*-eG9RafXm64AAAAAAAAAAAAADsp6AQ/original" width="630" alt="Find Spine asset">

If not checked, you can find the Spine asset in the local `public` folder. Use the <b>relative path</b> as the link when loading.
<img src="https://mdn.alipayobjects.com/huamei_kz4wfo/afts/img/A*KT9yTZWQ2C8AAAAAAAAAAAAADsp6AQ/original" width="300" alt="Find Spine asset">

2. Load using `resourceManager`.

After obtaining the Spine skeleton file's asset link, use `resourceManager` to load it. To manually add Spine to the scene, create a new entity and add the `SpineAnimationRenderer` component, as follows:
```typescript
import { SpineAnimationRenderer } from '@galacean/engine-spine';

// Load and obtain the Spine resource
const spineResource = await engine.resourceManager.load({
  url: 'https://galacean.raptor.json', // Or the relative file path, e.g., '../public/raptor.json"'
  type: 'spine', // The loader type must be specified as 'spine'
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
### Load Custom Uploaded Assets
1. Load the asset

If your Spine asset was not uploaded via the Galacean editor but uploaded to a CDN through a third-party platform, you can still load it using the Galacean Spine runtime loader.
```typescript
const resource = await engine.resourceManager.load({
  url: 'https://your.spineboy.json', // Custom uploaded asset
  type: 'spine', // The loader type must be specified as 'spine'
});
```
When loading custom uploaded assets:
- If passing a `url`, `ensure that the atlas and texture resources are in the same directory as the skeleton file`, e.g.:
<br>https://your.spineboy.json<br>https://your.spineboy.atlas<br>https://your.spineboy.png<br>
All three files must be in the same directory.

- If passing `urls` (multiple links), the same directory condition is not required:
```typescript
const resource = await engine.resourceManager.load({
  urls: [
    'https://your.spineboy.json',
    'https://another-path1.spineboy.altas',
    'https://another-path2.spineboy.png',
  ], // Custom uploaded asset
  type: 'spine', // The loader type must be specified as 'spine'
});
```
- If no texture address is provided, the loader will read the texture's image name from the atlas file and look for the texture resource relative to the atlas file's path.
<br>
- If the custom uploaded asset has no file extension (e.g., blob protocol URLs), you can add a URL query parameter, e.g.:
<br>https://your.spineboyjson?ext=.json<br>https://your.spineboyatlas?ext=.atlas<br>
Alternatively, use the `fileExtensions` parameter to specify resource suffix types:
```typescript
const resource = await engine.resourceManager.load({
  urls: [
    'https://your.spineboyjson',
    'https://another-path1.spineboyatlas',
    'https://another-path2.spineboypng',
  ], // Custom uploaded asset
  type: 'spine',
  fileExtensions: [
    'json', // Specify the first file as having a '.json' extension
    'atlas', // Specify the second file as having a '.atlas' extension
    'png', // Specify the third file as having a '.png' extension
  ]
});
```
- If the Spine animation's texture atlas contains multiple images, pass the image addresses in the order they appear in the atlas file.

2. Add to the scene

After loading, manually create an entity and add the `SpineAnimationRenderer` component:
```typescript
import { SpineAnimationRenderer } from '@galacean/engine-spine';

const spineResource = await engine.resourceManager.load({
  url: 'https://your.spineboy.json', // Custom uploaded asset
  type: 'spine',
});
// Create an entity
const spineEntity = new Entity(engine);
// Add the SpineAnimationRenderer component
const spine = spineEntity.addComponent(SpineAnimationRenderer);
// Set the animation resource
spine.resource = spineResource;
// Add to the scene
root.addChild(spineEntity);
```

## Using the Runtime API

In the [previous chapter](/docs/graphics/2D/spine/editor), we introduced the configuration options for the `SpineAnimationRenderer` component in the editor.  
This section provides a more detailed introduction to using various APIs of the `SpineAnimationRenderer` component in code.

The `SpineAnimationRenderer` component inherits from `Renderer`. In addition to exposing general methods of `Renderer`, it provides the following properties:

| Property          | Description                                                                                       | 
| :---------------- | :------------------------------------------------------------------------------------------------ | 
| resource          | Spine animation resource. After setting the resource, the `SpineAnimationRenderer` component reads the resource data and renders the Spine animation. | 
| setting           | Rendering settings. Used to enable clipping and adjust layer spacing.                              |
| defaultState      | Default state. Corresponding to the editor configuration options, used to set the default animation, skin, and scaling for Spine animation. | 
| state             | Animation state object. Enables advanced animation control, such as queued playback and loop control. | 
| skeleton          | Skeleton object. Used for advanced skeletal operations, such as attachment replacement and skin switching. |

Below is a more detailed usage introduction:

### Resource Setting
First, you need to set the resource. The `SpineAnimationRenderer` component can only render the Spine animation after setting the resource.  
In the previous chapter, "Loading Assets and Adding Them to the Scene", we already demonstrated how to set the resource:
```typescript
import { SpineAnimationRenderer } from '@galacean/engine-spine';

const spineResource = await engine.resourceManager.load({
  url: 'https://your.spineboy.json',
  type: 'spine',
});
const spineEntity = new Entity(engine);
const spine = spineEntity.addComponent(SpineAnimationRenderer);
spine.resource = spineResource; // Set Spine resource
root.addChild(spineEntity);
```

### Rendering Settings
In your script, you can modify the rendering settings of Spine as follows. Generally, the default values are sufficient:
```typescript
class YourAmazingScript {

  onStart() {
    const spine = this.entity.getComponent(SpineAnimationRenderer);
    spine.setting.zSpacing = 0.01; // Set layer spacing
    spine.setting.useClipping = true; // Enable or disable clipping, enabled by default
  }

}
``` 

### Default State
In your script, you can modify the default state of the Spine animation as follows:
```typescript
class YourAmazingScript {

  async onStart() {
    const spineResource = await engine.resourceManager.load({
      url: 'https://your.spineboy.json',
      type: 'spine',
    });
    const spineEntity = new Entity(engine);
    const spine = spineEntity.addComponent(SpineAnimationRenderer);
    spine.defaultState.animationName = 'your-default-animation-name'; // Default animation name
    spine.defaultState.loop = true; // Whether the default animation loops
    spine.defaultState.skinName = 'default'; // Default skin name
    spine.defaultState.scale = 0.02; // Default scaling
    spine.resource = spineResource; // Set the resource
    rootEntity.addChild(spineEntity); // Add to the scene, activating the component
  }

}
``` 
Note: The default state only takes effect when the `SpineAnimationRenderer` component is activated and the resource is set. To dynamically modify the animation, skin, or scaling, use the `state` and `skeleton` properties (see later sections).

### Animation Control
In your script, you can access the [AnimationState](https://zh.esotericsoftware.com/spine-api-reference#AnimationState) object for advanced animation operations:
```typescript
class YourAmazingScript {

  onStart() {
    const spine = this.entity.getComponent(SpineAnimationRenderer);
    const { state } = spine; // AnimationState object
  }
  
}
```
#### **Playing Animations**
Let's first introduce the most commonly used API: [setAnimation](https://zh.esotericsoftware.com/spine-api-reference#AnimationState-setAnimation)
```typescript
state.setAnimation(0, 'animationName', true)
```
The `setAnimation` function accepts three parameters:

- `TrackIndex`: The track index of the animation.
- `animationName`: The name of the animation.
- `loop`: Whether to loop the animation.

The last two parameters are self-explanatory, but the first parameter introduces the concept of **Track** in Spine animation:
> In Spine animations, you need to specify a track for playing animations. Tracks allow Spine to apply animations in layers. Each track stores animations and playback parameters, with track numbers starting from 0. When applying animations, Spine applies them from the lowest to the highest track. Higher tracks override animations on lower tracks.

Animation tracks have many uses. For example, track 0 can hold walking, running, or swimming animations, while track 1 can hold a shooting animation with keyframes for just the arms and shooting action. Additionally, setting the `TrackEntry` alpha for higher tracks allows blending with lower tracks. For instance, track 0 can have a walking animation, and track 1 can have a limping animation. When the player is injured, increasing the alpha value of track 1 intensifies the limp.

#### **Setting Transitions**
Calling `setAnimation` immediately switches the current track's animation. To add a transition effect, set the transition duration using the [AnimationStateData](https://zh.esotericsoftware.com/spine-api-reference#AnimationStateData) API:
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

- `defaultMix` is the default transition duration when no specific duration is defined between two animations.
- The `setMix` function accepts three parameters: the names of the two animations and the transition duration.

#### **Animation Queue**
Spine also provides the [addAnimation](https://zh.esotericsoftware.com/spine-api-reference#AnimationState-addAnimation2) method for queuing animations:
```typescript
state.setAnimation(0, 'animationA', false); // Play animation A on track 0
state.addAnimation(0, 'animationB', true, 0); // Queue animation B after animation A and loop it
```

addAnimation accepts four parameters:

- `TrackIndex`: The animation track.
- `animationName`: The name of the animation.
- `loop`: Whether to loop the animation.
- `delay`: The delay time.

The first three parameters are straightforward; let's explain the fourth parameter, `delay`.  
`delay` represents the time duration from when the previous animation starts playing.

When `delay > 0` (e.g., `delay` is 1), the next animation starts 1 second after the current animation begins, as shown below:
<img src="https://mdn.alipayobjects.com/huamei_irlgws/afts/img/A*-sY9TrNI8L8AAAAAAAAAAAAADvX8AQ/original" width="350" alt="animation delay > 0">

If the duration of animation A is less than 1 second, depending on whether it loops, it will either loop until 1 second or stay in its completed state until 1 second.

When `delay = 0`, the next animation starts after the current animation finishes, as shown below:
<img src="https://mdn.alipayobjects.com/huamei_irlgws/afts/img/A*jk2VRaHwUXMAAAAAAAAAAAAADvX8AQ/original" width="350" alt="animation delay = 0">

Assuming the duration of animation A is 1 second and the transition duration is 0.2 seconds, when `delay` is set to 0, animation B will transition at 0.8 seconds into animation B.

When `delay < 0`, the next animation starts playing before the current animation finishes, as shown below:
Similarly, assuming the duration of animation A is 1 second and the transition duration is 0.2 seconds, animation B will transition from 0.6 seconds into animation B.
<img src="https://mdn.alipayobjects.com/huamei_irlgws/afts/img/A*1xJDTLr0ygAAAAAAAAAAAAAADvX8AQ/original" width="350" alt="animation delay < 0">

In addition to `addAnimation`, you can also use the [addEmptyAnimation](https://zh.esotericsoftware.com/spine-api-reference#AnimationState-addEmptyAnimation) method to add an empty animation.  
Empty animations allow animations to return to their initial state.

`addEmptyAnimation` accepts three parameters: `TrackIndex`, `mixDuration`, and `delay`.  
`TrackIndex` and `delay` work the same as in `addAnimation`.  
`mixDuration` is the transition duration, during which the animation gradually returns to its initial state. The image below (the brown area on the right represents the empty animation) illustrates this:
<img src="https://mdn.alipayobjects.com/huamei_irlgws/afts/img/A*UdLBR4xoXAEAAAAAAAAAAAAADvX8AQ/original" width="267" alt="Add empty animation API">

#### **Track Parameters**
Both `setAnimation` and `addAnimation` methods return an object: `TrackEntry`.  
`TrackEntry` provides additional parameters for animation control, such as:

- `timeScale`: Controls the playback speed of the animation.
- `animationStart`: Controls the start time of the animation.
- `alpha`: The blending coefficient for applying the current animation to the track.

For more parameters, refer to the [TrackEntry official documentation](https://zh.esotericsoftware.com/spine-api-reference#TrackEntry).

#### **Animation Events**
<img src="https://mdn.alipayobjects.com/huamei_irlgws/afts/img/A*j4SmSKjherYAAAAAAAAAAAAADvX8AQ/original" width="681" alt="Animation event diagram">

When using the `AnimationState` API for animation control, events are triggered as shown in the diagram above.  
A `Start` event is triggered when a new animation begins playing.  
An `End` event is triggered when an animation is removed or interrupted from the queue.  
A `Complete` event is triggered when an animation finishes playing, regardless of whether it loops.

For a full list of events and detailed explanations, refer to the [Spine Animation Events official documentation](https://zh.esotericsoftware.com/spine-unity-events).

These events can be listened to using the [AnimationState.addListener](https://zh.esotericsoftware.com/spine-api-reference#AnimationState-addListener) method:
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
In your script, you can access the [Skeleton](https://zh.esotericsoftware.com/spine-api-reference#Skeleton) object to manipulate bones, slots, attachments, and more for advanced skeleton operations.
```typescript
class YourAmazingScript {

  onStart() {
    const spine = this.entity.getComponent(SpineAnimationRenderer);
    const { skeleton } = spine; // Skeleton object
  }
  
}
```
Below are some common operations:

#### **Modifying Bone Positions**
Using the Skeleton API, you can modify the position of Spine bones. A typical use case is setting the target bone of an IK to achieve aiming or tracking effects.
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
Note: Since playing animations can modify bone positions, if Spine is playing an animation, changes to bone positions must be done after the animation is applied, which means performing these operations in the `onLateUpdate` lifecycle of your script.

#### **Attachment Replacement**
Using the Skeleton API, you can replace [attachments](https://zh.esotericsoftware.com/spine-attachments) within [slots](https://zh.esotericsoftware.com/spine-slots). Attachment replacement can be used for effects like equipping different items or changing appearances locally.
```typescript
class YourAmazingScript {

  onStart() {
    const spine = this.entity.getComponent(SpineAnimationRenderer);
    const { skeleton } = spine; // Skeleton object
    // Find a slot by name
    const slot = skeleton.findSlot('slotName');
    // Get an attachment by name from the skeleton's skin or default skin
    const attachment = skeleton.getAttachment(slot.index, 'attachmentName');
    // Set the slot's attachment
    slot.attachment = attachment;
    // Or set the attachment via the skeleton's setAttachment method
    skeleton.setAttachment('slotName', 'attachmentName');
  }
}
```
Note: Since playing animations can modify attachments within slots, attachment replacement must be done after the animation is applied, which means performing these operations in the `onLateUpdate` lifecycle of your script.

#### **Skin Switching and Mixing**
**Skin Switching**

You can use the Skeleton's [setSkin](https://zh.esotericsoftware.com/spine-api-reference#Skeleton-setSkin) API to switch the entire skin based on its name.
```typescript
class YourAmazingScript {

  onStart() {
    const spine = this.entity.getComponent(SpineAnimationRenderer);
    const { skeleton } = spine; // Skeleton object
    // Set the skin by name
    skeleton.setSkinByName("full-skins/girl");
    // Reset to the initial pose (must call this to avoid rendering issues)
    skeleton.setSlotsToSetupPose();
  }

}
```

**Skin Mixing**

In the Spine editor, designers can prepare skins for each appearance and equipment, which can then be combined at runtime to create a new skin. The following code demonstrates how to add selected skins using `addSkin`:
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
The skin names used in the code come from the mix-and-match example.

In the next chapter, we will show you all [Spine Examples](/docs/graphics/2D/spine/example).

