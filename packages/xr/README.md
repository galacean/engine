## Installation

To install, use:

```sh
npm install @galacean/engine-xr
```

This will allow you to import engine entirely using:

```javascript
import * as XR from "@galacean/engine-xr";
```

## Usage

```typescript
// Create engine by passing in the HTMLCanvasElement
const engine = await WebGLEngine.create({ canvas: "canvas-id", xr: WebXRDevice});
......

// Run engine.
engine.run();
```
