# @galacean/engine-physics-havok

Havok WebAssembly physics backend for `@galacean/engine`, implementing Galacean's unified `IPhysics` interface.

## Installation

```sh
npm install @galacean/engine-physics-havok
```

Import the backend class:

```typescript
import { HavokPhysics } from "@galacean/engine-physics-havok";
```

Or import the package namespace:

```typescript
import * as PHYSICS_HAVOK from "@galacean/engine-physics-havok";
```

## Usage

### Default (Zero-Config)

With no arguments, `new HavokPhysics()` automatically resolves and loads the bundled `libs/HavokPhysics_umd.js` loader and `libs/HavokPhysics.wasm` binary:

```typescript
import { WebGLEngine } from "@galacean/engine";
import { HavokPhysics } from "@galacean/engine-physics-havok";

const engine = await WebGLEngine.create({
  canvas: "canvas",
  physics: new HavokPhysics()
});

engine.run();
```

### Custom Runtime Loading (`HavokRuntimeOptions`)

Pass a `HavokRuntimeOptions` object to `new HavokPhysics(options)` when self-hosting runtime assets, bundling with custom loaders, or running in Node.js:

| Option | Type | Description |
| --- | --- | --- |
| `jsUrl` | `string` | Custom URL for `HavokPhysics_umd.js`. If `wasmUrl` is omitted, `HavokPhysics.wasm` is resolved relative to `jsUrl`. |
| `wasmUrl` | `string` | Explicit URL for `HavokPhysics.wasm` (supplied to Emscripten `locateFile`). |
| `havokFactory` | `(moduleArg?: Record<string, unknown>) => Promise<unknown>` | Pre-imported Havok factory function (for example from `@babylonjs/havok`, or a custom factory passing `wasmBinary` in Node.js). |
| `havokInstance` | `unknown` | Already-initialized Havok WASM module instance. |

```typescript
import { WebGLEngine } from "@galacean/engine";
import { HavokPhysics } from "@galacean/engine-physics-havok";

// 1. Self-hosted CDN URLs
const physicsFromCdn = new HavokPhysics({
  jsUrl: "https://cdn.example.com/havok/HavokPhysics_umd.js",
  wasmUrl: "https://cdn.example.com/havok/HavokPhysics.wasm"
});

// 2. Pre-imported factory (e.g. from @babylonjs/havok or custom Node loader)
// import HavokPhysicsFactory from "@babylonjs/havok";
// const physicsFromFactory = new HavokPhysics({ havokFactory: HavokPhysicsFactory });

// 3. Pre-initialized Havok instance
// const physicsFromInstance = new HavokPhysics({ havokInstance: hk });

const engine = await WebGLEngine.create({
  canvas: "canvas",
  physics: physicsFromCdn
});
```

## Browser & Platform Requirements

- **WebAssembly SIMD (`v128`) required**: `HavokPhysics.wasm` is compiled with WebAssembly SIMD instructions and has **no non-SIMD fallback**. `initialize()` rejects if WebAssembly or WebAssembly SIMD is unavailable (supported in modern browsers including Chrome >= 91, Firefox >= 89, and Safari / iOS >= 16.4).
- **No `SharedArrayBuffer` / COOP / COEP required**: Simulation runs single-threaded on the main thread and does not require cross-origin isolation headers.
- **Payload size**: ~2.1 MB uncompressed runtime files (`HavokPhysics.wasm` ~2.09 MB + `HavokPhysics_umd.js` ~68 KB), totaling **~700 KB gzip** including the JS adapter.

## Capability Differences vs PhysX

`@galacean/engine-physics-havok` implements Galacean's `IPhysics` contract, but several APIs and solver behaviors differ from `@galacean/engine-physics-physx` due to Havok WASM constraints:

| Capability / Behavior | `@galacean/engine-physics-physx` | `@galacean/engine-physics-havok` |
| --- | --- | --- |
| Per-shape `contactOffset` | Supported | Not exposed in Havok WASM (no-op on shapes; `CharacterController.contactOffset` is supported via swept shape inflation) |
| Rigidbody `sleepThreshold`, `solverIterations`, `maxDepenetrationVelocity` | Configurable | Not exposed in Havok WASM (no-op) |
| Rigidbody `collisionDetectionMode` (CCD toggle) | Per-body mode toggle | No per-body CCD mode toggle (handled internally by Havok; setter ignores mode) |
| Joint `massScale`, `connectedMassScale`, `inertiaScale`, `connectedInertiaScale` | Configurable | Not exposed in Havok WASM constraint API (no-op) |
| `HingeJoint` `motor.gearRatio` (`setDriveGearRatio`) | Asymmetric per-body gear-ratio Jacobian | Approximated by scaling target velocity (`targetVelocity / gearRatio`); exact when the parent body is static or kinematic |
| `MeshCollider.cookingFlags` | Configures PhysX mesh cooking | Ignored in Havok WASM (degenerate triangles are always filtered) |
| Material combine precedence (`frictionCombine`, `bounceCombine`) | `Average < Minimum < Multiply < Maximum` | Havok `MaterialCombine` picks `max(a, b)` with `GEOMETRIC_MEAN (0) < MINIMUM (1) < MAXIMUM (2) < ARITHMETIC_MEAN (3) < MULTIPLY (4)`, so default `Average` overrides `Minimum` and `Maximum` |
| Static friction when `dynamicFriction === 0` | `staticFriction` still applies | Havok WASM disables friction completely when `dynamicFriction === 0`, regardless of `staticFriction` |
| `CharacterController` | Native PhysX CCT | TypeScript implementation built on Havok shape casts and a kinematic proxy body |
| `PlaneCollider` | Native infinite half-space | Approximated with a large slab (`10000 x 100 x 10000`) |
| Scene queries when all 32 layers disable every collision pair | Still hit by layer mask | Queries work whenever at least 1 of the 32 layers has any enabled collision bit; if all 32 layers simultaneously have empty masks (`0`), Havok's 32-bit symmetric filter cannot match queries |
| Trigger events on custom `havokInstance` | Native callback | Requires `HEAPU32` on the Havok WASM module (`@babylonjs/havok` 1.3.x `HP_Event_AsTrigger` does not expose trigger event type enums via Embind) |
| WASM runtime distribution | Open-source (`PhysX.js`), SIMD + non-SIMD builds | Closed-source prebuilt WASM binary, SIMD-only |

## License & Attribution

- `@galacean/engine-physics-havok` adapter code is licensed under the [MIT License](https://github.com/galacean/engine/blob/main/LICENSE).
- The bundled Havok WebAssembly runtime (`libs/HavokPhysics.wasm` and `libs/HavokPhysics_umd.js`) is redistributed from [`@babylonjs/havok`](https://github.com/BabylonJS/havok) `1.3.14` under the MIT License (`Copyright (c) 2023 Babylon.js`). See [`libs/LICENSE`](./libs/LICENSE) for the full license text.
