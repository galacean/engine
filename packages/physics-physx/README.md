## Installation

To install, use:

```sh
npm install @oasis-engine/physics-physx
```

This will allow you to import engine entirely using:

```javascript
import * as PHYSICS_PHYSX from "@oasis-engine/physics-physx";
```

or individual classes using:

```javascript
import { PhysXPhysics } from "@oasis-engine/physics-physx";
```

## Usage

```typescript
// Create engine by passing in the HTMLCanvasElement id and adjust canvas size.
const engine = new WebGLEngine("canvas-id");

// Initialize physics manager with PhysXPhysics.
engine.physicsManager.initialize(PhysXPhysics);

......

// Run engine.
engine.run();
```