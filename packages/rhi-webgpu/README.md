# WebGPU renderer

Applications can select the WebGPU flavor through `@galacean/engine-webgpu`. Serve the application over HTTPS or localhost so the browser exposes `navigator.gpu`.

```ts
import { Camera, MeshRenderer, PrimitiveMesh, UnlitMaterial, WebGPUEngine } from "@galacean/engine-webgpu";

const engine = await WebGPUEngine.create({ canvas: "canvas" });
const root = engine.sceneManager.activeScene.createRootEntity();
const camera = root.createChild("Camera").addComponent(Camera);
camera.entity.transform.setPosition(0, 0, 3);

const renderer = root.createChild("Cube").addComponent(MeshRenderer);
const mesh = (renderer.mesh = PrimitiveMesh.createCuboid(engine, 1, 1, 1));
const material = new UnlitMaterial(engine);
material.baseColor.set(1, 0.25, 0, 1);
renderer.setMaterial(material);
engine.run();
```

To move the first use of a material variant into a loading phase, call `await pass.preparePipeline(mesh, material, camera.renderTarget, { camera, renderer })` on its forward shader pass. This takes the mesh vertex layout, active macros, render state and camera attachment formats into account. Repeat preparation when introducing a new variant.

Use `await buffer.getDataAsync(out)` or `await texture.getPixelBufferAsync(out)` to read GPU-produced data. Readable buffers also support synchronous access to their current CPU copy. For repeated synchronous texture reads, call `await texture.makePixelBufferReadable(mipLevel, layer)` once after the last upload or render to that subresource. `MeshShape.prepare()` lets a loading phase await mesh-surface emission data.

## Backend contracts

| Engine input | Backend contract |
| --- | --- |
| Shader data | Group 0 contains Scene, group 1 Camera, group 2 Material and reflected Auto blocks, and group 3 Renderer, instancing and RenderElement. The physical binding of an Auto block is independent of property ownership. Draw-time lookup uses RenderElement, Renderer, Material, Camera and Scene in descending priority. Each variant carries its own binding numbers and visibility. |
| Uniform layouts | The compiler supplies byte offsets, array and matrix strides, byte length and block identity. Array elements are rounded to a 16-byte stride in uniform space. Buffer offsets satisfy the selected device’s minimum alignment. Queued draws retain the bytes visible at their submission point. |
| Textures and samplers | Depth comparison, ordinary filtering, and unfilterable float textures have distinct layout entries. Integer fetches of joint and blend-shape data use textureLoad. Sampler identity includes all sampling state. Pipeline validation counts sampled textures and samplers independently against the device limits. |
| Coordinates | Engine camera and culling math retain OpenGL clip depth. The shader backend maps vertex clip depth to (z + w) / 2 and accounts for window-space derivative orientation. The renderer defines attachment origin and screen sampling conventions for blits, shadows and offscreen cameras. |
| Vertex inputs | Attribute semantic and shader location are independent of the physical buffer format. Integer attributes supplied to floating-point ShaderLab inputs require a matching integer vertex input and numeric conversion. The pipeline key includes the actual vertex layout. |
| Particles | The WebGL2 backend captures feedback varyings. The WebGPU backend dispatches the same selected simulation through a compute entry and exposes the resulting storage buffer as the next vertex binding. Parent trajectory gather respects ring offsets and the number of children per parent. |

The WebGPU entry loads the shader compiler WASM when creating an engine. Each device owns its pipelines, bind groups, buffer slices and texture views. Historical shader bytecode retains its original instruction values. The loader can use the instruction stream to specialize old assets for WebGPU. Built-in WebGPU shaders also carry WGSL and reflection for their default variant.

The device requests the adapter's advertised per-stage limits for sampled textures and samplers. Under a lower limit the compiler can share identical views and samplers and combine compatible material textures in layers. Compatible mip chains keep their original texels and sampling coordinates. Applications can use `graphicDeviceOptions.requiredLimits` to exercise minimum-limit devices. Unsupported combinations produce a diagnostic listing their resource inputs and the exceeded limit.

Native compressed formats and optional depth or 16-bit normalized formats depend on adapter features. Query the engine's format capabilities when selecting raw texture data. A KTX2 asset can be transcoded to a supported format. WebXR projection rendering requires a secure context, an XR-compatible adapter and a browser exposing `XRGPUBinding`. Each eye uses the view, viewport and depth attachment supplied by its session.
