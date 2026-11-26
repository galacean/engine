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

The runtime defaults to the adjacent `libs/` directory. A classic worker using `importScripts()` supplies the PhysX loader URL explicitly. See the [runtime paths and worker options](../../docs/en/physics/overall.mdx). In 2.0, npm mirror URLs use `@galacean/engine-physics-physx/dist/libs/*`. The Galacean CDN serves the runtime at `<version>/libs/*`.
