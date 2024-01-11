## Installation

`@galacean/engine-xr` is the implementation layer of XRManager and is a necessary package for developing XR applications.

To install, use:

```sh
npm install @galacean/engine-xr
```

This will allow you to import engine entirely using:

```javascript
import { WebXRDevice } from "@galacean/engine-xr-webxr";
import { XRHitTest, XRSessionMode } from "@galacean/engine-xr";
```

## Usage

```typescript
import { WebXRDevice } from "@galacean/engine-xr-webxr";
import { XRHitTest, XRSessionMode } from "@galacean/engine-xr";

// Create engine by passing in the HTMLCanvasElement
WebGLEngine.create({
  canvas: "canvas",
  xrDevice: new WebXRDevice(),
}).then((engine) => {
  // Users need to actively click the button to enter XR
  XRButton.onClick = function () {
    this.engine.xrManager.enterXR(XRSessionMode.AR).then(
      () => {
        console.log("Enter AR");
      },
      (error) => {
        console.log("Not supported AR", error);
      }
    );
  };
});
......
```
