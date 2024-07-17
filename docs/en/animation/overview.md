---
order: 0
title: Animation System Overview
type: Animation
label: Animation
---

The animation system of Galacean has the following features:

- Parse animations from GLTF/FBX models and convert them into AnimationClip objects in Galacean
- Add animations to all components and their properties in Galacean
- Set the start/end time of animations to trim them
- Set transitions between animations to layer multiple animations
- Apply animations from one model to another
- Add animation events and scripts for animation lifecycle

## Animation Workflow

The overall workflow for creating interactive projects using the editor:

```mermaid
flowchart LR
 Add animation clips --> Create animator controller and import animation clips --> Add animator component to play animations
```

### 1. Add Animation Clips

The animation system of Galacean is based on the concept of animation clips, which contain information on how certain objects should change their position, rotation, or other properties over time. Each animation clip can be seen as a single linear recording.

You can create animation clips in the editor, see [Creating Animation Clips](/en/docs/animation-clip), or import models with animations created using third-party tools (such as Autodesk® 3ds Max®, Autodesk® Maya®, Blender), see [Creating Animation Clips for Artists](/en/docs/animation-clip-for-artist), or from motion capture studios or other sources.

### 2. Create Animator Controller and Import Animation Clips

The animator controller is a structured system similar to a flowchart that acts as a state machine in the animation system, responsible for tracking which clip should be played and when animations should change or blend together.

You can learn how to use it in this [Animator Controller](/en/docs/animation-animatorController).

### 3. Add Animator Component

After creating the animator controller, we need to add the [Animator Component](/en/docs/animation-animator) to the entity and bind the animator controller asset to play animations.
