# Seed business shader export

The Seed templates ship their authored shader instructions together with the default WebGPU vertex/fragment modules and resource reflection. Both RHIs use the same project resources. WebGL2 evaluates the instructions. WebGPU selects the baked pair when the material, vertex layout and device match, and specializes the instructions when needed.

After modifying Seed terrain or water ShaderLab shaders, regenerate the WebGPU modules, water content addresses, project references, and conversion receipts directly from the repository root using the workspace's native AST-based ShaderLab WGSL compiler (`@galacean/engine-shader-compiler`, zero external WASM or `glslang`/`twgsl` required):

```sh
pnpm install --frozen-lockfile
pnpm b:module
pnpm --dir world prepare:engine
pnpm --dir world export:seed-shaders
```

Only when re-translating the 16 legacy pre-baked masonry `.shaderc` assets under `packages/building/src/building/assets/native/Shaders/` (which store recovered GLSL without `.shader` ShaderLab source) is an optional offline translation tools directory required:

```sh
pnpm --dir world export:seed-shaders /path/to/translation-tools
```

The optional `translation-tools` directory contains:

- The platform's `glslang` executable (`glslang.exe` on Windows), version 16.6.0. [Khronos release](https://github.com/KhronosGroup/glslang/releases/tag/16.6.0)
- The TWGSL wrapper saved as `twgsl.cjs` and its matching `twgsl.wasm`. The exporter verifies their SHA-256 hashes. [Wrapper](https://raw.githubusercontent.com/BabylonJS/Babylon.js/47f84cf6dc635e97bfef29408be1cea41279334a/packages/tools/babylonServer/public/twgsl/twgsl.js) · [WebAssembly module](https://raw.githubusercontent.com/BabylonJS/Babylon.js/47f84cf6dc635e97bfef29408be1cea41279334a/packages/tools/babylonServer/public/twgsl/twgsl.wasm)

Without `translation-tools`, existing WGSL stages in `packages/building/src/building/assets/native/Shaders/*.shaderc` are preserved unchanged, while all ShaderLab terrain and water shaders are re-exported directly via the workspace's WebGPU ShaderLab compiler (`packages/shader/src/ShaderLibrary`). The Seed Vite build reads the checked-in exports and copies them into the static assets and binary bundles. Newly authored material variants and device-specific layouts use the runtime compiler.
