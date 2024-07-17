---
order: 6
title: Lottie
type: Graphics
group: 2D
label: Graphics/2D
---

[lottie](https://airbnb.io/lottie/) is a cross-platform animation solution released by Airbnb around 2017, which can be used on iOS, Android, React Native, and web. It parses animations from [AE](https://www.adobe.com/products/aftereffects.html) using the Bodymovin plugin and exports json files that can render animations on mobile and web. Designers create animations in AE, export the corresponding json files using Bodymovin, and provide them to front-end developers. Front-end developers can use this json file to directly generate animations that are 100% faithful to the original.

Users can easily handle Lottie assets and add components in Galacean.

### Resource Upload

It is recommended that designers encode images in base64 format when exporting Lottie files in AE and write them into the json file.

After developers receive the `.json` file, they need to upload the file to the Galacean Editor. Select the "lottie" asset from the asset panel by clicking the upload button, choose a local [lottie json](https://github.com/galacean/galacean.github.io/files/14106485/_Lottie.3.json) file, and then upload it:

<img src="https://mdn.alipayobjects.com/huamei_w6ifet/afts/img/A*UQ1LTI_mYv4AAAAAAAAAAAAADjCHAQ/original"   />

### Add Component

Select an entity, add a Lottie component, choose the resource uploaded in the previous step, and the Lottie effect will be displayed and played:

![lottie](https://mdn.alipayobjects.com/huamei_w6ifet/afts/img/A*ehFMT7vBaCAAAAAAAAAAAAAADjCHAQ/original)

Developers can adjust various parameters in the property panel to configure Lottie:

![lottie](https://mdn.alipayobjects.com/huamei_w6ifet/afts/img/A*OswOQI837OkAAAAAAAAAAAAADjCHAQ/original)


| Property | Description |
| :--- | :--- |
| `resource` | Select Lottie asset |
| `autoPlay` | Whether to autoplay, default is true |
| `isLooping` | Whether to loop, default is true |
| `speed` | Playback speed, `1` is normal speed, larger values play faster |
| `priority` | Rendering priority, the smaller the value, the higher the priority, and the earlier it is rendered |

Sometimes developers may need to dynamically configure Lottie during runtime. Add the following code in the script component:
```typescript
// First find the entity where Lottie is located (lottieEntity), then get the LottieAnimation.
const lottie = lottieEntity.getComponent(LottieAnimation);
// Set lottie's property
lottie.speed = 2;
```
Sometimes developers only upload Lottie assets in the editor and dynamically create the LottieAnimation at runtime when needed. The usage is as follows:
```typescript
// Dynamically load Lottie assets from the editor.
const lottieResource = await engine.resourceManager.load({url: '/光球.json', type: 'EditorLottie'});
// Add LottieAnimation.
const lottie = entity.addComponent(LottieAnimation);
// Set lottie's resource.
lottie.resource = lottieResource;
```
Additionally, the Lottie component provides 2 APIs to control animation playback and pause:

| Method | Description |
| :--- | :--- |
| `play` | Play animation, passing in the animation segment name will play a specific animation segment |
| `pause` | Pause animation |

### Listen for Playback End

Often, there is a need to listen for the end of Lottie animation playback, such as running some business logic when the animation ends. The `play` method of `LottieAnimation` returns a `Promise`, making it easy to listen for the end of the animation:

```typescript
const lottie = lottieEntity.getComponent(LottieAnimation);
await lottie.play();
// do something next..
```

### Slicing Functionality

The editor provides a feature to slice animations, dividing the entire segment provided by the designer into multiple segments. Each segment needs to define three fields: segment name, start frame, and end frame.

<playground src="lottie-clips.ts"></playground>

<img src="https://mdn.alipayobjects.com/huamei_w6ifet/afts/img/A*skjbSZjSpYoAAAAAAAAAAAAADjCHAQ/original" style="zoom:100%;" />

This operation will add a `lolitaAnimations` field in the Lottie protocol to implement animation slicing.

```json
"lolitaAnimations": [
  {
    "name": "clip1",
    "start": 0,
    "end": 30
  },
  {
    "name": "clip2",
    "start": 50,
    "end": 100
  },
]
```


### Installing Dependencies

<a href="https://www.npmjs.com/package/@galacean/engine-lottie" target="_blank">@galacean/engine-lottie</a> is a second-party package of Galacean Engine. When using Lottie in your project, make sure to install this package in your project:

```bash
npm i @galacean/engine-lottie --save
```

### Pro Code Development Mode

When developing in `Pro Code` mode, you need a `json` file and an `atlas` file to implement the `lottie` animation. Usually, when artists export from After Effects (AE), they only provide the `json` file to developers. In this case, you need to use the [tools-atlas-lottie](https://www.npmjs.com/package/@galacean/tools-atlas-lottie) `CLI` tool to generate the `atlas` file.

```typescript
import { LottieAnimation } from "@galacean/engine-lottie";

// Load lottie json、atlas file with engine's `resourceManager`
engine.resourceManager.load({
  urls: [
    "https://gw.alipayobjects.com/os/bmw-prod/b46be138-e48b-4957-8071-7229661aba53.json",
    "https://gw.alipayobjects.com/os/bmw-prod/6447fc36-db32-4834-9579-24fe33534f55.atlas"
  ],
  type: 'lottie'
}).then((lottieEntity) => {
  // Add lottie entity created to scene 
  root.addChild(lottieEntity);

  // Get `LottieAnimation` component and play the animation
  const lottie = lottieEntity.getComponent(LottieAnimation);
  lottie.isLooping = true;
  lottie.speed = 1;
  lottie.play();
});
```

<playground src="lottie.ts"></playground>


### 3D Transformation

There is often a need for 3D transformations in business scenarios, such as entry animations for pop-ups. Taking rotation as an example, traditional lottie-web solutions can only rotate along the **Z-axis** (i.e., perpendicular to the screen normal direction). Even if we achieve rotation along the **X-axis** or **Y-axis** in AE, it will be ignored when played using lottie-web.

<img src="https://gw.alipayobjects.com/mdn/rms_d27172/afts/img/A*qVYxTaEdVBgAAAAAAAAAAAAAARQnAQ" alt="3D rotation" style="zoom:50%;" />

Thanks to the unified architecture of Galacean Engine's 2D/3D engine, 3D transformation can be easily implemented.

<playground src="lottie-3d-rotation.ts"></playground>

## Performance Recommendations

- Simplify animations. When creating animations, always remember to keep the json file concise, for example, avoid using path keyframe animations that occupy the most space. Techniques like auto-trace drawing and jitter can make the json file very large and performance-intensive.
- If there are looping frames, do not loop them within the animation file. Count the number of frames and let developers control the loop of this animation segment, which can save space for the same layers and animations.
- Create shape layers. Convert resources like AI, EPS, SVG, and PDF into shape layers; otherwise, they cannot be used normally in lottie. After conversion, remember to delete the resource to prevent it from being exported to the json file.
- Set dimensions. In AE, you can set the composition size to any size, but make sure the export size matches the resource size.
- Trim paths appropriately for performance impact.
- When animating with lottie, it layers according to AE's design, so try to minimize the number of layers.
- If path animations are not necessary, replace vector shapes with PNG images and animate using the transform property.
- Consider reducing animation frame rate or keyframe count based on actual conditions, which will reduce the number of drawings per second.
- Shorten animation duration. For looping actions, avoid duplicating them on the timeline; each read of a keyframe consumes performance. Try to avoid a sequence where action a ends and action b begins; overlapping actions can reduce animation length.
- Merge similar items. Some elements are similar or identical but used in different places. Pre-compose these elements for reuse, adjusting the animation properties of this pre-composition to achieve the desired animation effect.
- Minimize the number of layers. Each layer will be exported as corresponding json data, so reducing layers can significantly reduce json size.
- Draw all layers in AE rather than importing from other software. Importing from other software may result in a large json section describing this graphic.
- When creating, fill the animation elements **across** the entire canvas to avoid waste and facilitate size adjustments by the front end.
- If vector shapes are exported from AI, delete unnecessary "groups" and other elements that have no practical use.
- Remove closed and unused properties.
- Export only 1x images.
- To avoid compatibility issues with lottie exports, try to use the English version of AE, keep the layers concise, and name them clearly.
- Avoid large areas of vector parts and large particle effects.

{ /*examples*/ }
