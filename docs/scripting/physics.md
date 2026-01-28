# Physics

Galacean Engine offers a flexible physics system that can be powered by different backend implementations. This allows you to choose the physics engine that best fits your project's needs, balancing features, performance, and package size. The two primary options are `physics-lite` and `physics-physx`.

To use a physics engine, you must initialize it through the `physicsManager`.

## Choosing a Physics Engine

Your choice of physics engine has a significant impact on your project. Here is a summary of the two main options:

- **`@galacean/engine-physics-lite`**: A lightweight, dependency-free physics engine built directly into the Galacean ecosystem. It is ideal for projects that require basic collision detection (raycasting, triggers, basic colliders) but do not need complex physics simulations like realistic rigid body dynamics or joints.
    - **Pros**: Very small, fast for basic cases, no external dependencies.
    - **Cons**: Limited features; no rigid body dynamics, joints, or advanced colliders.

- **`@galacean/engine-physics-physx`**: A powerful and feature-rich physics engine powered by a WebAssembly (WASM) version of NVIDIA's PhysX. This is the recommended choice for most 3D games and complex simulations that require realistic physics interactions.
    - **Pros**: Full-featured rigid body dynamics, complex colliders (mesh, convex), joints, and stable stacking.
    - **Cons**: Larger package size due to the required WASM module.

| Feature | `physics-lite` | `physics-physx` |
| :--- | :---: | :---: |
| Rigid Body Dynamics | ❌ | ✅ |
| Joints | ❌ | ✅ |
| Mesh Colliders | ❌ | ✅ |
| Triggers / Raycasting | ✅ | ✅ |
| Package Size | Very Small | Large |
| External Dependencies | None | PhysX WASM |

## Using `physics-lite`

This is the simplest option. After installing the package, import `LitePhysics` and pass it to the physics manager.

```ts
import { WebGLEngine } from "@galacean/engine";
import { LitePhysics } from "@galacean/engine-physics-lite";

// Create the engine
const engine = await WebGLEngine.create({ canvas: "canvas" });

// Initialize the physics manager with the LitePhysics backend
engine.physicsManager.initialize(LitePhysics);

// Your scene setup...

engine.run();
```

## Using `physics-physx`

To use the PhysX backend, you need to import `PhysXPhysics`. This implementation depends on a `.wasm` file that must be served alongside your application. The engine will automatically try to load it from a default path, but you can and should specify the path to the WASM file for robust applications.

```ts
import { WebGLEngine } from "@galacean/engine";
import { PhysXPhysics } from "@galacean/engine-physics-physx";

// Create the engine
const engine = await WebGLEngine.create({ canvas: "canvas" });

// Initialize the physics manager with the PhysXPhysics backend
// The second argument is the path to the PhysX WASM file.
await engine.physicsManager.initialize(PhysXPhysics, {
  wasmPath: "/path/to/physx.release.wasm"
});

// Your scene setup...

engine.run();
```

> **Important**: The `physx.release.wasm` file is located inside the `@galacean/engine-physics-physx/libs` directory in your `node_modules`. You must configure your build process to copy this file to a public directory so it can be fetched at runtime.

## API Reference

The API for interacting with physics (e.g., adding colliders, raycasting) is consistent regardless of the backend you choose. The primary difference is the initialization step.

```apidoc
PhysicsManager:
  Methods:
    initialize(physics: IPhysics, options?: any): Promise<void>
      - Initializes the physics system with a specific backend implementation.
      - `physics`: The physics class to use (e.g., `LitePhysics`, `PhysXPhysics`).
      - `options`: An optional object for configuration. For `PhysXPhysics`, this is where you provide the `wasmPath`.

LitePhysics:
  - A class representing the lightweight physics backend. Pass this class constructor to `initialize`.

PhysXPhysics:
  - A class representing the PhysX-based physics backend. Pass this class constructor to `initialize`.
```
