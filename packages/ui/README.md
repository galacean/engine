# @galacean/engine-ui

`@galacean/engine-ui` is a UI library designed for the `@galacean/engine`, this library enables developers to create and manage user interfaces efficiently within their **Galacean-based** applications. It is important to note that it is currently in an **experimental version**.

## Features

- **Rendering components**: Includes `Image` and `Text`.
- **Interactive Components**: Include `Button`, as well as other planned basic rendering components to be added in the future.
- **Event Handling**: Supports the dispatch and bubbling of events such as `onPointerEnter`, `onPointerExit`,`onPointerDown`, `onPointerUp`, `onPointerClick`, `onPointerDrag` and `onPointerDrop`.
- **Optimized Performance**: Designed to run smoothly with the Galacean engine.

## Installation

To use `@galacean/engine-ui` in your project, install it via npm:

```bash
npm install @galacean/engine-ui
```

## Getting Started

Here is a simple example to help you get started:

```typescript
import { AssetType, Camera, Sprite, Texture2D, Vector3, WebGLEngine } from "@galacean/engine";
import { CanvasRenderMode, Image, ResolutionAdaptationMode, UICanvas } from "@galacean/engine-ui";

// Initialize engine and scene
const engine = await WebGLEngine.create({ canvas: "canvas" });
const scene = engine.sceneManager.activeScene;
const rootEntity = scene.createRootEntity();

// Create camera
const cameraEntity = rootEntity.createChild("Camera");
cameraEntity.transform.position = new Vector3(0, 0, 10);
const camera = cameraEntity.addComponent(Camera);
camera.farClipPlane = 200;
camera.nearClipPlane = 0.3;

// Create canvas
const canvasEntity = rootEntity.createChild("canvas");
const canvas = canvasEntity.addComponent(UICanvas);
canvas.renderMode = CanvasRenderMode.ScreenSpaceCamera;
canvas.resolutionAdaptationMode = ResolutionAdaptationMode.HeightAdaptation;
canvas.distance = 100;
canvas.renderCamera = camera;

// Create Image
const imageEntity = canvasEntity.createChild("image");
const image = imageEntity.addComponent(Image);
engine.resourceManager
  .load({
    url: "https://xxx.png",
    type: AssetType.Texture2D
  })
  .then((texture) => {
    image.sprite = new Sprite(engine, <Texture2D>texture);
  });

// Run the engine
engine.run();
```
Easier operations in the [Editor](https://galacean.antgroup.com/editor/).

## Documentation

For detailed documentation, visit [the official documentation site](https://galacean.antgroup.com/engine).
