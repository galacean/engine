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
import { WebGLEngine } from "@galacean/engine";
import { PhysXPhysics } from "@galacean/engine-physics-physx";

const engine = await WebGLEngine.create({ canvas: "canvas-id", physics: new PhysXPhysics() });
engine.run();
```

The UMD, ESM, and CommonJS entries load the runtime from the adjacent `libs/` directory. In 2.0, update direct imports and CDN links from `@galacean/engine-physics-physx/libs/*` to `@galacean/engine-physics-physx/dist/libs/*`.
