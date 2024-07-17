---
order: 1
title: Animation Clip
type: Animation
label: Animation
---

**Animation Clip** is one of the core elements of the Galacean animation system. Galacean supports importing model animations designed in external design software. Each animation in the model with animations output by designers will be parsed into individual **animation clips** assets in Galacean. We can also create additional animations through the animation clip editor.

There are two common ways to obtain animation clips:

1. Import models with animations created using third-party tools (such as Autodesk® 3ds Max®, Autodesk® Maya®, Blender). See [Creating Animation Clips for Artists](/en/docs/animation-clip-for-artist) for more details.

![1](https://mdn.alipayobjects.com/huamei_3zduhr/afts/img/A*Qc8sQ6iJd8IAAAAAAAAAAAAADsJ_AQ/original)

2. Create animation clips in Galacean (the editor and script creation methods will be introduced below).

## Animation Panel Introduction

The animation clip editor currently supports editing all interpolatable properties except for physics-related components. If you need to edit other properties, you must add the corresponding components to the entity.

![alt text](https://mdn.alipayobjects.com/huamei_3zduhr/afts/img/A*3SAjRb60cfoAAAAAAAAAAAAADsJ_AQ/original)

> Note: The Galacean animation editor defaults to 60FPS. The time shown in the above image as `0:30` is at 30 frames. If the time axis scale is `1:30`, it is at 90 frames.

## Basic Operations

### Transform Component Example

1. Right-click or click + in the **[Asset Panel](/en/docs/assets-interface)** to create an `Animation Clip` asset.

![alt text](https://mdn.alipayobjects.com/huamei_3zduhr/afts/img/A*j4FMRKx91nEAAAAAAAAAAAAADsJ_AQ/original)

2. Double-click the `Animation Clip` asset and select an entity as the editing object for the `Animation Clip`.

![alt text](https://mdn.alipayobjects.com/huamei_3zduhr/afts/img/A*_E1kRqt8LroAAAAAAAAAAAAADsJ_AQ/original)

Click the `Create` button, and the editor will automatically add an [Animation Controller Component](/en/docs/animation-animator) to your Entity and add this animation clip to the [Animation Controller](/en/docs/animation-animatorController).

![alt text](https://mdn.alipayobjects.com/huamei_3zduhr/afts/img/A*q46SRrV6WfsAAAAAAAAAAAAADsJ_AQ/original)
![alt text](https://mdn.alipayobjects.com/huamei_3zduhr/afts/img/A*C2a4SZDGG_4AAAAAAAAAAAAADsJ_AQ/original)

3. Add properties to animate (I added two here).

![alt text](https://mdn.alipayobjects.com/huamei_3zduhr/afts/img/A*69xIS7ABJJkAAAAAAAAAAAAADsJ_AQ/original)
![alt text](https://mdn.alipayobjects.com/huamei_3zduhr/afts/img/A*-4bnQI-LcLsAAAAAAAAAAAAADsJ_AQ/original)

4. Add keyframes to the properties.

![alt text](https://mdn.alipayobjects.com/huamei_3zduhr/afts/img/A*QnQwR6tLRYMAAAAAAAAAAAAADsJ_AQ/original)
When we click the add keyframe button, the keyframe will store the value of the currently specified property. So, when we haven't changed anything, the keyframe stores the `position` value of this entity at that moment. We want it to move to the position (3, 0, 0) 60 frames later, so first modify the cube to (3, 0, 0) through the property panel and then add the keyframe.
![alt text](https://mdn.alipayobjects.com/huamei_3zduhr/afts/img/A*ClTgSriu4-8AAAAAAAAAAAAADsJ_AQ/original)
Similarly, we also add keyframes for the `rotation` property.
![alt text](https://mdn.alipayobjects.com/huamei_3zduhr/afts/img/A*hOkoRKlNfeYAAAAAAAAAAAAADsJ_AQ/original)

##### Recording Mode

We provide a recording mode to help developers quickly add keyframes. When recording mode is enabled, keyframes will be automatically added when the corresponding property is modified.

![alt text](https://mdn.alipayobjects.com/huamei_3zduhr/afts/img/A*sFwtSLOlyhoAAAAAAAAAAAAADsJ_AQ/original)

### Text Animation Example

First, you need an entity with the TextRender component.

![alt text](https://mdn.alipayobjects.com/huamei_3zduhr/afts/img/A*VGEGS6kOBqkAAAAAAAAAAAAADsJ_AQ/original)

Now, when adding properties, you can see that the properties that can have keyframes added have increased related to the TextRenderer component's interpolable properties.

![alt text](https://mdn.alipayobjects.com/huamei_3zduhr/afts/img/A*X5YxQb_HieUAAAAAAAAAAAAADsJ_AQ/original)

Follow the steps above to add keyframes using the recording mode.

![alt text](https://mdn.alipayobjects.com/huamei_3zduhr/afts/img/A*tsTqSqZVsdUAAAAAAAAAAAAADsJ_AQ/original)

### Frame Animation Example

In addition to numerical types, Galacean also supports reference types of animation curves. You can read about how to create frame animations in the [Frame Animation](/en/docs/animation-sprite-sheet) documentation.

### Material Animation Example

Galacean also supports editing animations of asset properties within components. If there are material assets in the component, there will be additional asset property editing in the `Inspector`.

![alt text](https://mdn.alipayobjects.com/huamei_3zduhr/afts/img/A*ctbcSKqHmIAAAAAAAAAAAAAADsJ_AQ/original)

Please note that the default [material](/en/docs/graphics-material) in the editor is not editable.

![alt text](https://mdn.alipayobjects.com/huamei_3zduhr/afts/img/A*SNRHQbOcqhAAAAAAAAAAAAAADsJ_AQ/original)

So, if we want to animate the material of this cube, we need to create a new material and replace it. Then, just like the steps above, enable recording mode and directly modify the properties.

![alt text](https://mdn.alipayobjects.com/huamei_3zduhr/afts/img/A*uEQOS52hXpUAAAAAAAAAAAAADsJ_AQ/original)
![alt text](https://mdn.alipayobjects.com/huamei_3zduhr/afts/img/A*TGDFTrXZbAEAAAAAAAAAAAAADsJ_AQ/original)

## More Operations

### Manipulating Keyframes

#### Modifying Keyframe Time

Select the keyframe and drag it to adjust.

![alt text](https://mdn.alipayobjects.com/huamei_3zduhr/afts/img/A*_vZSR4YEDqMAAAAAAAAAAAAADsJ_AQ/original)

You can zoom in/out the timeline by scrolling the `mouse wheel`.

![alt text](https://mdn.alipayobjects.com/huamei_3zduhr/afts/img/A*BTgPS45hkNYAAAAAAAAAAAAADsJ_AQ/original)

#### Modifying Keyframe Value

Enable recording mode, move the timeline to the specific keyframe, and then re-enter the value. If recording mode is not enabled, you need to click the add keyframe button again.

![alt text](https://mdn.alipayobjects.com/huamei_3zduhr/afts/img/A*MiSXQZ4q7DMAAAAAAAAAAAAADsJ_AQ/original)

#### Deleting Keyframes

Right-click on the keyframe and select delete, or press the delete/backspace key on the keyboard to delete.

![alt text](https://mdn.alipayobjects.com/huamei_3zduhr/afts/img/A*MpPMRK2WaEMAAAAAAAAAAAAADsJ_AQ/original)

### Editing Child Entities

`Animation clips` can not only be applied to entities with the `Animator` component but also to their child entities.

1. Add a child entity to the cube we created earlier.

![alt text](https://mdn.alipayobjects.com/huamei_3zduhr/afts/img/A*6RYIQpG7DPwAAAAAAAAAAAAADsJ_AQ/original)

2. After clicking on "Add Attribute" again, you can see that the properties of the sub-entity can be added.

![alt text](https://mdn.alipayobjects.com/huamei_3zduhr/afts/img/A*j7rfRq0REKIAAAAAAAAAAAAADsJ_AQ/original)

3. Enable recording mode, edit the sub-entity to add keyframes.

![alt text](https://mdn.alipayobjects.com/huamei_3zduhr/afts/img/A*j7rfRq0REKIAAAAAAAAAAAAADsJ_AQ/original)


### Edit Animation Curves

The `Animation Segment Editor` supports animation curve editing. Click on the curve icon in the top right corner to switch.

![alt text](https://mdn.alipayobjects.com/huamei_3zduhr/afts/img/A*luV0QaDUAQAAAAAAAAAAAAAADsJ_AQ/original)

The vertical axis in curve mode represents the numerical value of the property.

![alt text](https://mdn.alipayobjects.com/huamei_3zduhr/afts/img/A*luV0QaDUAQAAAAAAAAAAAAAADsJ_AQ/original)


You can adjust the vertical axis scale by pressing `shift + scroll wheel`.

![alt text](https://mdn.alipayobjects.com/huamei_3zduhr/afts/img/A*SjO2TaubiuIAAAAAAAAAAAAADsJ_AQ/original)

The color of the property corresponds to the color of the curve and button.

![alt text](https://mdn.alipayobjects.com/huamei_3zduhr/afts/img/A*OS3uSbdB36AAAAAAAAAAAAAADsJ_AQ/original)

Selecting a keyframe will display two control points. Adjust the control points to adjust the curve.

![alt text](https://mdn.alipayobjects.com/huamei_3zduhr/afts/img/A*kikYQoiYMLoAAAAAAAAAAAAADsJ_AQ/original)

You can also directly set preset values by right-clicking on a keyframe.

![alt text](https://mdn.alipayobjects.com/huamei_3zduhr/afts/img/A*KRzoT5Pocc4AAAAAAAAAAAAADsJ_AQ/original)

Selecting a property in the property panel allows you to edit the curve of that specific property only.



## Script Usage

> Before using scripts, it is recommended to read the [Animation System Composition](/en/docs/animation-system) document to help you better understand the operation logic of the animation system.

You can create an [AnimationClip](/apis/core/#AnimationClip) yourself and bind it with [AnimationCurve](/apis/core/#AnimationCurve) using [addCurveBinding](/apis/core/#AnimationClip-addCurveBinding).

```typescript
//custom rotate clip
const rotateClip = new AnimationClip("rotate");
const rotateState =
  animator.animatorController.layers[0].stateMachine.addState("rotate");
rotateState.clip = rotateClip;

const rotateCurve = new AnimationVector3Curve();
const key1 = new Keyframe<Vector3>();
key1.time = 0;
key1.value = new Vector3(0, 0, 0);
const key2 = new Keyframe<Vector3>();
key2.time = 10;
key2.value = new Vector3(0, 360, 0);
rotateCurve.addKey(key1);
rotateCurve.addKey(key2);
rotateClip.addCurveBinding("", Transform, "rotation", rotateCurve);

//custom color clip
const colorClip = new AnimationClip("color");
const colorState =
  animator.animatorController.layers[0].stateMachine.addState("color");
colorState.clip = colorClip;

const colorCurve = new AnimationFloatCurve();
const key1 = new Keyframe<number>();
key1.time = 0;
key1.value = 0;
const key2 = new Keyframe<number>();
key2.time = 10;
key2.value = 1;
colorCurve.addKey(key1);
colorCurve.addKey(key2);
colorClip.addCurveBinding("/light", DirectLight, "color.r", colorCurve);
```

You can also bind an AnimationCurve to your sub-entity `/light`, just like the code example above. Additionally, the third parameter of `addCurveBinding` is not limited to component properties; it is a path that can index to a value.

<playground src="animation-customAnimationClip.ts"></playground>

### Animation Events

You can use [AnimationEvent](/apis/core/#AnimationEvent) to add events to AnimationClip. Animation events will call the specified callback function on the component bound to the same entity at the specified time.

```typescript
const event = new AnimationEvent();
event.functionName = "test";
event.time = 0.5;
clip.addEvent(event);
```

<playground src="animation-event.ts"></playground>

