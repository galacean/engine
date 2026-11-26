# Seed business shader export

All Seed business shaders — Terrain (`packages/terrain/src/shaders/*.shader`), Water (`packages/terrain/src/data/seed-world/source/Shader/Water/*.shader`), and all 16 Building shaders (`packages/building/src/building/shaders/native/*.shader`) — are authored in standard `dev/2.0` ShaderLab and compiled through the engine's single-AST compiler (`@galacean/engine-shader-parser` + `GLES300Visitor` + `WGSLVisitor` + `WGSLProgramLinker`) with zero external dependencies (`glslang`, `twgsl`, or WASM are not used).

Both RHIs share the same project resources:
- **WebGL2** evaluates `vertexShaderInstructions` / `fragmentShaderInstructions` (GLSL ES 3.00).
- **WebGPU** uses the pre-linked default `wgsl` when the material, vertex layout, and device match, or evaluates `wgslVertexInstructions` / `wgslFragmentInstructions` directly with `WGSLProgramLinker` for dynamic macro variants.

After modifying any Seed Terrain, Water, or Building `.shader` source, regenerate the dual GLSL/WGSL `.shaderc` exports, water content addresses, project references, and conversion receipts from the repository root:

```sh
pnpm install --frozen-lockfile
pnpm b:module
pnpm --dir world prepare:engine
pnpm --dir world export:seed-shaders
```
