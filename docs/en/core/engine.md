---
order: 0
title: Engine
type: Core
label: Core
---

`Engine` plays the role of the main controller in Galacean Engine, mainly including three major functions: **canvas**, **render control**, and **engine subsystem management**:

- **[Canvas](/en/docs/core-canvas)**: Operations related to the main canvas, such as modifying the canvas width and height.
- **Render Control**: Controls rendering execution/pause/resume, vertical synchronization, and other functions.
- **Engine Subsystem Management**:
  - [Scene Management](/en/docs/core-scene})
  - [Resource Management](/en/docs/assets-overall})
  - [Physics System](/en/docs/physics-overall})
  - [Interaction System](/en/docs/input})
  - [XR System](/en/docs/xr-overall})
- **Context Management for Execution Environment**: Controls the context management of WebGL and other execution environments.

## Initialization

To facilitate users in creating a web-based engine directly, Galacean provides [WebGLEngine](${api}rhi-webgl/WebGLEngine):

```typescript
const engine = await WebGLEngine.create({ canvas: "canvas" });
```

> `WebGLEngine.create` not only instantiates the engine but also handles rendering context configuration and initialization of certain subsystems.

### Rendering Context

Developers can set the context's rendering configuration in the [Export Interface](/en/docs/assets-build).

<img src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*WZHzRYIpUzQAAAAAAAAAAAAADhuCAQ/original" style="zoom:50%;" />

You can also manage this by setting the third parameter [WebGLGraphicDeviceOptions](${api}rhi-webgl/WebGLGraphicDeviceOptions) of [WebGLEngine](${api}rhi-webgl/WebGLEngine}), for example, to manage **canvas transparency**, the engine by default enables the canvas's alpha channel, meaning the canvas will blend with the elements behind it. If you need to disable transparency, you can do so like this:

```typescript
const engine = await WebGLEngine.create({
  canvas: htmlCanvas,
  graphicDeviceOptions: { alpha: false },
});
```

Similarly, you can control WebGL1/2 with `webGLMode`, and attributes other than `webGLMode` will be passed to the context. For more details, refer to the [getContext parameter interpretation](https://developer.mozilla.org/en-US/en/docs/Web/API/HTMLCanvasElement/getContext#parameters).

### Physics System

Refer to the [Physics System](/en/docs/physics-overall) documentation.

### Interaction System

Refer to the [Interaction System](/en/docs/input) documentation.

### XR System

Refer to the [XR System](/en/docs/xr-overall) documentation.

## Properties

| Property Name                                         | Property Description                                                                                                                                                                                                                             |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [time](/apis/core/#Engine-time)                        | Information related to engine time.                                                                                                                                                                                                               |
| [vSyncCount](/apis/core/#Engine-vSyncCount)             | By default, the engine enables [vertical synchronization](https://en.wikipedia.org/wiki/Screen_tearing) with a refresh rate `vSyncCount` of `1`, meaning it synchronizes with the screen refresh rate. If `vSyncCount` is set to `2`, the engine updates every 2 frames. |
| [resourceManager](/apis/core/#Engine-resourceManager)  | Resource management.                                                                                                                                                                                                                             |
| [sceneManager](/apis/core/#Engine-sceneManager)        | Scene management. _Engine_ serves as the main controller, _Scene_ acts as a scene unit for easy entity management in large scenes; _Camera_ is a component attached to a specific entity in _Scene_, similar to a real camera, allowing you to capture any entity in the _Scene_ and render it to a screen area or off-screen rendering. |
| [inputManager](/apis/core/#Engine-inputManager)        | Interaction management.                                                                                                                                                                                                                          |

### Refresh Rate

By default, the engine uses vertical synchronization mode and [vSyncCount](/apis/core/#Engine-vSyncCount) to control the rendering refresh rate. In this mode, the rendering frame waits for the vertical synchronization signal of the screen. [vSyncCount](/apis/core/#Engine-vSyncCount) represents the expected number of screen synchronization signals between rendering frames, with a default value of 1. The value of this property must be an integer. For example, if we want to render 30 frames per second on a device with a screen refresh rate of 60 frames, we can set this value to 2.

Users can also disable vertical synchronization by setting [vSyncCount](/apis/core/#Engine-vSyncCount) to 0 and then setting [targetFrameRate](/apis/core/#Engine-targetFrameRate) to the desired frame rate value. In this mode, rendering does not consider vertical synchronization signals. For example, setting it to 120 means expecting 120 frames per second.

```typescript
// 垂直同步
engine.vSyncCount = 1;
engine.vSyncCount = 2;

// 非垂直同步
engine.vSyncCount = 0;
engine.targetFrameRate = 120;
```

> ⚠️ It is not recommended to use non-vertical synchronization

## Methods

| Method Name                         | Method Description      |
| ----------------------------------- | ----------------------- |
| [run](/apis/core/#Engine-run)        | Execute engine frame loop |
| [pause](/apis/core/#Engine-pause)    | Pause engine frame loop   |
| [resume](/apis/core/#Engine-resume)  | Resume engine rendering loop |
| [destroy](/apis/core/#Engine-destroy)| Destroy the engine       |
