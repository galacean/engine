---
order: 0
title: Overview of the Animation System
type: Animation
label: Animation
---

Galacean's animation system has the following features:

- Parse animations from GLTF/FBX models and convert them into AnimationClip objects in Galacean
- Add animations to all components and their properties in Galacean
- Set the start/end time of animations to trim them
- Set transitions between animations and overlay multiple animations
- Apply animations from one model to another model
- Add animation events and scripts for the animation lifecycle

## Animation Workflow

The overall workflow for creating interactive projects using the editor:

```mermaid
flowchart LR
 Add Animation Clip --> Create Animation Controller and Import Animation Clip --> Add Animation Control Component to Play Animation
```

### 1. Add Animation Clip

Galacean's animation system is based on the concept of animation clips, which contain information on how certain objects should change their position, rotation, or other properties over time. Each animation clip can be considered a single linear recording.

You can create animation clips in the editor, see [Creating Animation Clips](/en/docs/animation/clip) for details. You can also import models with animations created using third-party tools (such as Autodesk® 3ds Max®, Autodesk® Maya®, Blender), see [Creating Animation Clips for Artists](/en/docs/animation/clip-for-artist) for details, or from motion capture studios or other sources.

### 2. Create Animation Controller and Import Animation Clip

The animation controller is a structured system similar to a flowchart that acts as a state machine in the animation system, responsible for tracking which clip should be played currently and when animations should change or blend together.

You can learn how to use it in this [Animation Controller](/en/docs/animation/animatorController/).

### 3. Add Animation Control Component

After editing the animation controller, we need to add the [Animation Control Component](/en/docs/animation/animator) to the entity and bind the animation controller asset to play the animation.
