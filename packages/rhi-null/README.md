# Headless graphics backend

`@galacean/engine/headless` creates the same Engine, Scene, Transform, Mesh and Renderer objects without creating a GPU context or registering DOM input listeners.

```ts
import { HeadlessEngine, MeshRenderer, PrimitiveMesh } from "@galacean/engine/headless";

const engine = await HeadlessEngine.create();
const entity = engine.sceneManager.activeScene!.createRootEntity("Box");
const renderer = entity.addComponent(MeshRenderer);
renderer.mesh = PrimitiveMesh.createCuboid(engine, 2, 4, 6);
console.log(renderer.bounds);
engine.destroy();
```

Creation leaves the engine paused. Reads such as `renderer.bounds` use the regular engine implementation without advancing time. Call `engine.update()` to advance a frame or `engine.run()` to use the host scheduler; `pause()` and `destroy()` stop it. Simulation advances scripts and animation normally, so do not call it merely to inspect an untrusted project.

The backend retains buffer bytes, texture descriptors, materials and references. Drawing is skipped. Pixel readback, framebuffer copies, transform feedback and direct WebGL access require a graphics device and throw. No GPU shader compilation or rendered-image validation is performed.

The regular resource manager and loaders remain in use. In Node, requests use fetch for JSON, text, blobs and array buffers. Image decoding, system-font measurement, audio playback, XR and browser-only loader extensions still require their corresponding host services; the bundled PhysX bootstrap also currently requires a browser. Supply a host-compatible physics implementation through `physics` when needed. The headless entry does not emulate them or manufacture results.

CPU particle simulation follows the existing non-transform-feedback path. Active systems continue simulating without camera visibility results. GPU-only particle modules are unavailable. Skin bounds retain the existing Engine semantics; headless execution does not add vertex-deformation bounds or a second geometry implementation.

The `@galacean/engine-rhi-null` package exposes `HeadlessEngine`, `HeadlessCanvas` and `NullGraphicDevice` for custom engine bootstraps. As with `WebGLEngine`, such bootstraps must register their classes, loaders and built-in shaders; use the umbrella headless entry for the default setup.
