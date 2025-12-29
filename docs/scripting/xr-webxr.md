# WebXR Backend

Galacean Engine's XR capabilities are designed with a flexible backend system. The `@galacean/engine-xr` package provides the high-level abstractions and management (`XRManager`), while one or more backend packages provide the concrete implementation that communicates with the hardware. 

`@galacean/engine-xr-webxr` is the standard backend for building AR/VR experiences on the web. It acts as a bridge between Galacean's XR system and the browser's native WebXR Device API.

## Architecture Overview

- **`@galacean/engine-xr`**: The core XR package. It defines interfaces and helpers like `XRManager`, `XRCamera`, `XRInputManager`, `XRSessionMode` (AR/VR), and `XRHitTest`. Your application code will primarily interact with these APIs.

- **`@galacean/engine-xr-webxr`**: The WebXR implementation package. It provides the `WebXRDevice` class, which is a concrete implementation of the `IXRDevice` interface defined in the core `xr` package. Its job is to manage the WebXR session, handle input, and provide tracking data to the rest of the engine.

## Setup and Initialization

To enable XR functionality, you must instantiate a `WebXRDevice` and pass it to the engine upon creation. This tells the engine to initialize the XR system using the WebXR backend.

```ts
import { WebGLEngine } from "@galacean/engine";
import { WebXRDevice } from "@galacean/engine-xr-webxr";
import { XRSessionMode } from "@galacean/engine-xr";

async function main() {
  // Create an engine instance with the WebXRDevice
  const engine = await WebGLEngine.create({
    canvas: "canvas",
    xrDevice: new WebXRDevice()
  });

  // ... scene setup ...

  engine.run();

  // It is required to start an XR session via a user gesture, like a button click.
  const xrButton = document.getElementById("xr-button");
  xrButton.onclick = () => {
    // Use the engine's XRManager to request and enter an XR session.
    engine.xrManager.enterXR(XRSessionMode.AR).then(
      () => {
        console.log("Successfully entered AR mode.");
      },
      (error) => {
        console.error("Failed to enter AR mode:", error);
      }
    );
  };
}

main();
```

## Entering and Exiting an XR Session

As shown above, an XR session must be initiated by a user gesture.

- **`engine.xrManager.enterXR(mode)`**: Requests to enter an XR session. The `mode` can be `XRSessionMode.AR` for Augmented Reality or `XRSessionMode.VR` for Virtual Reality. This method returns a `Promise` that resolves if the session is successfully entered and rejects if the device does not support the requested mode or the user denies permission.

- **`engine.xrManager.exitXR()`**: Exits the current XR session and returns to normal rendering. This also returns a `Promise`.

## Accessing XR Features

Once in an XR session, you can access XR features through the `XRManager`.

```ts
const xrManager = engine.xrManager;

// Get the current session mode (AR or VR)
const mode = xrManager.sessionMode;

// Access input sources (controllers, hands)
const inputManager = xrManager.inputManager;
inputManager.inputs.forEach((input) => {
  console.log(`Found input source: ${input.trackingState}`);
});

// Perform a hit test (in AR)
const hitTest = xrManager.hitTest;
if (hitTest) {
  const results = hitTest.execute(input.ray, xrManager.session.getHitTestTrackableTypes());
  if (results.length > 0) {
    // A surface was found
    const hitPose = results[0].pose;
    // ... position an object at the hit pose ...
  }
}
```

## API Reference

```apidoc
WebXRDevice:
  - The main class from the `@galacean/engine-xr-webxr` package.
  - Implements the `IXRDevice` interface.
  - An instance of this class must be passed to the `WebGLEngine.create` method in the `xrDevice` property to enable WebXR.

EngineCreationOptions:
  Properties:
    xrDevice: IXRDevice
      - The XR device implementation to use. For WebXR, this should be `new WebXRDevice()`.

XRManager:
  Methods:
    enterXR(mode: XRSessionMode): Promise<void>
      - Requests to enter an AR or VR session.
    exitXR(): Promise<void>
      - Exits the current XR session.
  Properties:
    sessionMode: XRSessionMode
      - The current session mode (AR, VR, or None).
    inputManager: XRInputManager
      - Manages XR input sources like controllers and hands.
    cameraManager: XRCameraManager
      - Manages the camera in an XR session.
    hitTest: XRHitTest
      - Provides access to AR hit-testing functionality.
```
