---
order: 6
title: Lottie
type: Graphics
group: 2D
label: Graphics/2D
---

[lottie](https://airbnb.io/lottie/) is a cross-platform animation solution released by Airbnb around 2017. It can be applied to iOS, Android, React Native, and web. It parses [AE](https://www.adobe.com/products/aftereffects.html) animations through the Bodymovin plugin and exports json files that can render animations on mobile and web. Designers create animations using AE and export the corresponding json files with Bodymovin for the frontend, which can use these json files to generate 100% accurate animations.

Users can easily handle Lottie assets and add components in Galacean.

### Resource Upload

It is recommended that designers use base64 format for images when exporting Lottie files in AE, embedding them into the Lottie json file.

After obtaining the `.json` file, developers need to upload the `.json` file to the Galacean Editor. Use the upload button in the asset panel to select the "lottie" asset, choose a local [lottie json](https://github.com/galacean/galacean.github.io/files/14106485/_Lottie.3.json) file, and then upload it:

<img src="https://mdn.alipayobjects.com/huamei_w6ifet/afts/img/A*UQ1LTI_mYv4AAAAAAAAAAAAADjCHAQ/original"   />

### Add Component

Select an entity, add the Lottie component, and choose the resource as the asset uploaded in the previous step to display and play the Lottie effect:

![lottie](https://mdn.alipayobjects.com/huamei_w6ifet/afts/img/A*ehFMT7vBaCAAAAAAAAAAAAAADjCHAQ/original)

Developers can adjust various parameters in the properties panel to configure the Lottie:

![lottie](https://mdn.alipayobjects.com/huamei_w6ifet/afts/img/A*OswOQI837OkAAAAAAAAAAAAADjCHAQ/original)

| Property | Description |
| :--- | :--- |
| `resource` | Select Lottie asset |
| `autoPlay` | Auto play, default is auto |
| `isLooping` | Loop play, default is loop |
| `speed` | Play speed, `1` is the original speed, the larger the value, the faster the play |
| `priority` | Render priority, the smaller the value, the higher the render priority |

Sometimes developers may need to dynamically set Lottie at runtime. Add the following code in the script component:
```typescript
// 先找到 Lottie 所在的实体 lottieEntity，然后获取 Lottie 组件
const lottie = lottieEntity.getComponent(LottieAnimation);
// 设置 lottie 属性
lottie.speed = 2;
```
Sometimes developers only upload Lottie resources in the editor and dynamically create Lottie components when needed. Use the following method:
```typescript
// 动态加载编辑器中的 Lottie 资源
const lottieResource = await engine.resourceManager.load({url: '/光球.json', type: 'EditorLottie'});
// 给一个实体添加 Lottie 组件
const lottie = entity.addComponent(LottieAnimation);
// 给 Lottie 组件设置 Lottie 资源
lottie.resource = lottieResource;
```

Additionally, the Lottie component provides 2 APIs to control animation play and pause:

| Method | Description |
| :--- | :--- |
| `play` | Play animation, passing in the animation segment name will play a specific segment |
| `pause` | Pause animation |

### Listen for Play End

Often, we need to listen for the end of a Lottie animation to run some business logic. The `play` method of `LottieAnimation` returns a `Promise`, making it easy to listen for the end of the animation:

```typescript
const lottie = lottieEntity.getComponent(LottieAnimation);
await lottie.play();
// do something next..
```

### Slicing Function

The editor provides an animation slicing function, allowing you to cut the entire segment provided by the designer into multiple segments. Each segment needs to define three fields: segment name, start frame, and end frame.

<playground src="lottie-clips.ts"></playground>

<img src="https://mdn.alipayobjects.com/huamei_w6ifet/afts/img/A*skjbSZjSpYoAAAAAAAAAAAAADjCHAQ/original" style="zoom:100%;" />

This operation will add the `lolitaAnimations` field in the Lottie protocol to implement animation slicing:

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

### Install Dependencies

<a href="https://www.npmjs.com/package/@galacean/engine-lottie" target="_blank">@galacean/engine-lottie</a> is a secondary package of the Galacean Engine. When using Lottie in the project, ensure that this package is installed:

```bash
npm i @galacean/engine-lottie --save
```

### Pro Code Development Mode

When developing in `Pro Code` mode, you need a `json` file and an `atlas` file to implement `lottie` animations. Usually, the art team exports only the `json` file through `AE`. In this case, you need to use the [tools-atlas-lottie](https://www.npmjs.com/package/@galacean/tools-atlas-lottie) `CLI` tool to generate the `atlas` file.

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

### 3D Transform

In business scenarios, there is often a need for 3D transformations, such as entrance animations for pop-ups. For example, with rotation, traditional lottie-web solutions can only rotate along the **Z-axis** (i.e., perpendicular to the screen's normal direction). Even if we achieve rotation along the **X-axis** or **Y-axis** in AE, it will be ignored when played with lottie-web.

<img src="https://gw.alipayobjects.com/mdn/rms_d27172/afts/img/A*qVYxTaEdVBgAAAAAAAAAAAAAARQnAQ" alt="3D rotation" style="zoom:50%;" />

Thanks to the unified architecture of the Galacean Engine 2D/3D engine, 3D transformation functions can be easily implemented.

<playground src="lottie-3d-rotation.ts"></playground>

### Version Dependencies
| Engine Version |  Lottie Version |
| :--- | :--- |
| 1.2.x | 1.1.0-beta.0 |
| 1.3.x | engine-1.3 |
| 1.4.x | engine-1.4 |

## Performance Recommendations

- Simplify animations. Always keep the json file streamlined when creating animations, for example, by avoiding the use of path keyframe animations that take up the most space. Techniques like auto-tracing and wiggling can make the json file very large and performance-intensive.
- If there are looping frames, do not loop them in the animation file. Count the frames and let the developer control the loop of this animation, which can save the size of the same layers and animations.
- Create shape layers. Convert resources like AI, EPS, SVG, and PDF into shape layers; otherwise, they cannot be used properly in lottie. After conversion, be sure to delete the resource to prevent it from being exported to the json file.
- Set dimensions. In AE, you can set the composition size to any size, but make sure the composition size and resource size are consistent when exporting.
- Trim paths appropriately to meet the effect as much as possible, as this greatly impacts performance.
- Lottie will layer according to AE's design during animation, so try to reduce the number of layers.
- If path animation is not necessary, replace vector graphics with png images and use the transform attribute to complete the animation.
- Depending on the actual situation, consider lowering the animation frame rate or reducing the number of keyframes, which will reduce the number of drawings per second.
- Simplify the animation duration. For actions that can loop, do not do them twice on the timeline. Each keyframe read consumes performance. Try to avoid the end of action a and the start of action b in the arrangement; actions can overlap to reduce animation length.
- Merge similar items. If some elements are similar or used in different places, pre-compose this element and reuse this component. You can achieve the desired animation effect by adjusting the animation properties of the pre-composition.
- Minimize the number of layers. Each layer will be exported as corresponding json data, and reducing layers can significantly reduce the json size.
- Try to ensure all layers are drawn in AE rather than imported from other software. If imported from other software, the json part describing this graphic may become very large.
- When creating, make sure the animation elements **cover** the entire canvas to avoid waste and facilitate front-end size adjustments.
- If vector graphics are exported from AI, delete unnecessary "groups" and other elements that have no practical use.
- Delete those closed and useless properties.
- Only export 1x images.
- To prevent compatibility issues with lottie exports, try to use the English version of AE, keep layers simple, and name them clearly.
- Avoid large vector parts and large particle effects.
