---
order: 0
title: Engine
type: Core
label: Core
---

`Engine` plays the role of the main controller, primarily encompassing functions such as **canvas**, **render control**, and **engine subsystem management**:

- **[Canvas](/docs/core/canvas)**: Operations related to the main canvas, such as modifying the canvas width and height.
- **Render Control**: Functions to control the execution, pause, resume of rendering, vertical synchronization, etc.
- **Engine Subsystem Management**: [Scene Management](/docs/core/scene), [Resource Management](/docs/assets/overall), [Physics System](/docs/physics/overall), [Interaction System](/docs/input/input/), [XR System](/docs/xr/overall)
- **Execution Environment Context Management**: Management of context for execution environments like WebGL.

## Initialization

To facilitate users directly creating a web engine, we provide the [WebGLEngine](/apis/rhi-webgl/#WebGLEngine), which supports WebGL1.0 and WebGL2.0.

```typescript
const engine = await WebGLEngine.create({
  canvas: "canvas-id",
  colorSpace: {...},
  graphicDeviceOptions: {...},
  gltf: {...},
  ktx2Loader: {...}                                   
});
```

Below is a description of the [configuration](/apis/galacean/#WebGLEngineConfiguration) types passed when creating the engine:

| Configuration                                                  | Description                                                 |
| ------------------------------------------------------------ | ------------------------------------------------------------ |
| canvas                                                       | Can be a canvas ID (`string`) or a canvas object (`HTMLCanvasElement | OffscreenCanvas`) |
| [graphicDeviceOptions](/apis/galacean/#WebGLGraphicDeviceOptions) | Configuration related to the graphics device, e.g., `webGLMode` can control WebGL1/2. Properties other than `webGLMode` will be passed to the context, more details can be found in [getContext parameters explanation](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/getContext#parameters). |
| [colorSpace](/apis/galacean/#ColorSpace)                     | Color space, `ColorSpace.Gamma` or `ColorSpace.Linear`.        |
| gltf                                                         | GLTF Loader configuration, `workerCount` is used to configure the number of workers for meshOpt: `{ meshOpt: { workerCount: number } }`. |
| ktx2Loader                                                   | KTX2 Loader configuration, `workerCount` is used to configure the number of workers for the ktx2 decoder: `{ priorityFormats: Array<KTX2TargetFormat>; transcoder: KTX2Transcoder; workerCount: number }`. If workerCount is greater than 0, worker threads will be created; if it equals 0, only the main thread will be used. |

For more related configuration information, please refer to [Physics System](/docs/physics/overall), [Interaction System](/docs/input/input/), [XR System](/docs/xr/overall).

## Properties

| Property Name | Description |
| --- | --- |
| [time](/apis/core/#Engine-time) | Engine time-related information, more details can be found in [Time](/docs/core/time/) |
| [vSyncCount](/apis/core/#Engine-vSyncCount) | Vertical sync refresh rate. The engine defaults to enable [vertical sync](https://baike.baidu.com/item/%E5%9E%82%E7%9B%B4%E5%90%8C%E6%AD%A5/7263524?fromtitle=V-Sync&fromid=691778) with a refresh rate `vSyncCount` of `1` (same as the screen refresh rate). If `vSyncCount` is set to `2`, the engine updates once every 2 screen refresh frames. |
| [resourceManager](/apis/core/#Engine-resourceManager) | Resource manager, generally used for [loading](/docs/assets/load/) and [releasing](/docs/assets/gc/) assets. |
| [sceneManager](/apis/core/#Engine-sceneManager) | Scene manager. Galacean supports rendering multiple scenes simultaneously, and the scene manager allows convenient management of scene additions, deletions, modifications, and queries. More details can be found in [Scene](/docs/core/scene/). |
| [inputManager](/apis/core/#Engine-inputManager) | Interaction manager, generally used to get information about keyboards, touch, and wheel inputs. More details can be found in [Interaction](/docs/input/input/). |

### Refresh Rate

By default, the engine uses vertical sync mode and controls the rendering refresh rate with [vSyncCount](/apis/core/#Engine-vSyncCount). In this mode, the rendering frame waits for the screen's vertical sync signal, and [vSyncCount](/apis/core/#Engine-vSyncCount) represents the desired number of screen sync signals between rendering frames. The default value is 1, and this property must be an integer. For example, if we want to render 30 frames per second on a device with a 60Hz screen refresh rate, we can set this value to 2.

Users can also disable vertical sync by setting [vSyncCount](/apis/core/#Engine-vSyncCount) to 0 and then setting [targetFrameRate](/apis/core/#Engine-targetFrameRate) to the desired frame rate. In this mode, rendering does not consider vertical sync signals. For instance, a value of 120 means 120 frames, which indicates a desired refresh rate of 120 times per second.

```typescript
// Vertical sync
engine.vSyncCount = 1;
engine.vSyncCount = 2;

// No vertical sync
engine.vSyncCount = 0;
engine.targetFrameRate = 120;
```

> ⚠️ Non-vertical sync is not recommended.

## Methods

| Method Name                              | Description          |
| ------------------------------------- | ------------------ |
| [run](/apis/core/#Engine-run)         | Executes the engine render frame loop |
| [pause](/apis/core/#Engine-pause)     | Pauses the engine render frame loop |
| [resume](/apis/core/#Engine-resume)   | Resumes the engine render loop |
| [destroy](/apis/core/#Engine-destroy) | Destroys the engine |