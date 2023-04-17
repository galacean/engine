## Installation

To install, use:

```sh
npm install @galacean/engine-physics-physx
```

This will allow you to import engine entirely using:

```javascript
import * as PHYSICS_PHYSX from "@galacean/engine-physics-physx";
```

or individual classes using:

```javascript
import { PhysXPhysics } from "@galacean/engine-physics-physx";
```

## Usage

```typescript
// Create engine by passing in the HTMLCanvasElement id and adjust canvas size
const engine = await WebGLEngine.create({ canvas: "canvas-id" });

// Initialize physics manager with PhysXPhysics.
engine.physicsManager.initialize(PhysXPhysics);

......

// Run engine.
engine.run();
```