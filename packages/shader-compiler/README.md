## Installation

```sh
npm install @galacean/engine-shader-compiler
```

## Usage

```typescript
import { Shader, ShaderFactory, WebGLEngine } from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";

// Create shader compiler
const shaderCompiler = new ShaderCompiler();

// Create engine with shader compiler
const engine = await WebGLEngine.create({ canvas: "canvas", shaderCompiler });

......

// Create shader by galacean shader code directly
const shader = Shader.create(galaceanShaderCode);

// Register project chunks before creating shaders that include them
ShaderFactory.registerInclude("ShaderLibrary/UserCommon.glsl", userCommonSource);
const shaderWithIncludes = Shader.create(galaceanShaderCodeWithIncludes);

.......

// Run engine
engine.run()
```

Authoring diagnostics are provided separately by `@galacean/engine-shader-analyzer`; the runtime compiler does not include analyzer diagnostics.

`Shader.create()` never needs a filesystem path. Include paths are resolved against logical keys registered through `ShaderFactory.registerInclude()`:

| Registered key | Current logical shader | `#include` | Result |
| --- | --- | --- | --- |
| `User/Math.glsl` | no loader metadata | `"User/Math.glsl"` or `"/User/Math.glsl"` | `User/Math.glsl` |
| `User/Math.glsl` | no loader metadata | `"./User/Math.glsl"` | `User/Math.glsl` |
| `Assets/Shaders/Math.glsl` | `Assets/Shaders/PBR.shader` | `"./Math.glsl"` | `Assets/Shaders/Math.glsl` |
| `Assets/Shared/Math.glsl` | `Assets/Shaders/PBR.shader` | `"../Shared/Math.glsl"` | `Assets/Shared/Math.glsl` |

The asset loader supplies the current logical shader location internally. Moving a shader folder remains valid when the shader asset and its registered include keys move together. Disk paths do not define the logical root.

## Scene and camera uniform blocks

A pass can group numeric uniforms that share a `Scene` or `Camera`. Declare the block at shader scope and refer to each member by name inside the pass.

```glsl
uniform Scene {
    vec3 skyCoefficients[9];
};
uniform Camera {
    mat4 viewProjection;
};
```

Set these properties on the corresponding owner's `shaderData`. For example, `scene.shaderData.setFloatArray("skyCoefficients", coefficients)` accepts 27 tightly packed floats. The compiler records a 16-byte stride for each `vec3`, and the runtime inserts the padding on upload. Matrices use column-major order. Block members support numeric and boolean scalars, vectors, matrices and fixed-length arrays.

Each pass supports one layout per group across both stages, includes and macro variants. For example, `ShaderLibrary/Common/Transform.glsl` already declares the pass's `Camera` layout. Additional camera properties can use the existing loose declaration syntax. Multiple shaders can share a layout by including the same block declaration.

Engine uniforms migrated from public shader includes keep their existing override order. For example, setting `camera_Position` on a material still overrides the camera's value for that draw. A custom member of an explicit `Camera` block reads from `camera.shaderData`.

The compiler also describes ordinary uniform declarations in the pass's optional `uniformPlan`. When the engine links a variant, it uses the declarations selected by that variant's macros and inheritance to pack numeric values into std140 blocks. A loose property can be set on any existing `ShaderData` owner. Lookup follows the existing priority of render element, renderer, material, camera, then scene. Samplers keep their texture bindings. Struct members retain their property paths, such as `scene_EnvMapLight.diffuse`.

Historical `.shaderc` files load directly from their original instruction streams. A pass without `uniformPlan` uses the bindings and instancing path from that format. The numeric instruction opcodes are shared across these formats.

Numeric arrays whose size exceeds the device's block limit can keep a typed loose binding. When the compiler cannot establish a representable array bound for a sampler or an array of structs across variants, it emits that pass in the original instruction format. This preserves authored GLSL expressions and texture bindings for those assets.

## Precompile

Import `ShaderPrecompiler` from `@galacean/engine-shader-compiler/precompile` to generate `.shaderc` data in memory. The CLI writes this data to files.

Compile a directory tree to `.shaderc` artifacts:

```sh
shader-compiler-precompile Assets/Shaders build/shaders --clean --emit-index
```

The input directory is the logical registry root. A shader at `PBR/Root.shader` resolves `./Common.glsl` to `PBR/Common.glsl`; `/Shared/Math.glsl` and `Shared/Math.glsl` both resolve to `Shared/Math.glsl` below the input root. Compilation failures exit non-zero and prevent Rollup builds using the plugin from succeeding.

### WebGPU

Compile the same ShaderLab assets with `--target wgsl` to produce a separate WebGPU shader library. Each render pass stores its default WGSL stages and resource reflection in `wgsl`. The original instruction fields continue to select macro variants. Historical instruction-only assets also work on WebGPU. The compiler reconstructs their numeric uniform layouts from the selected declarations.

```sh
shader-compiler-precompile Assets/Shaders build/shaders-webgpu --target wgsl --clean --emit-index
```

The `@galacean/engine-webgpu` entry loads the native TypeScript AST-based WGSL compiler and matching built-in assets (no external WASM dependency). Tools can construct the compiler once and specialize individual passes directly.

```typescript
import { createWebGPUShaderCompiler, compileWebGPUShaderPass } from "@galacean/engine-shader-compiler/webgpu";
import { PBRSource } from "@galacean/engine-shader/webgpu";

const compiler = await createWebGPUShaderCompiler();
const pass = PBRSource.subShaders[0].passes.find((candidate) => !candidate.isUsePass)!;
const macros = new Map([["MATERIAL_HAS_BASETEXTURE", ""]]);
const program = compileWebGPUShaderPass(compiler, pass, macros);
```

`program.reflection` describes the selected vertex attributes, stage outputs, texture and sampler bindings, and std140 byte layouts. Shader specialization uses the mesh's input types and the bound textures' sampling state. Texture loads need only a texture binding. Extended materials share identical sampler descriptors and repeated texture views within each bind group. If active views exceed the device limit, compatible material textures can share layers of a single 2D array. Each property retains its own sampling state and mip levels. Incompatible texture sizes, formats, or mip chains require separate views.

Inherited helper calls use forward declarations while overriding function bodies keep their original macro context. GLES can move ordinary struct signature dependencies ahead of those declarations. If this requires moving a type with conditional fields, macro-dependent array bounds, or across macro/precision changes, code generation reports `UnsupportedForwardDeclaration` with source context and rejects the pass. This is a GLES backend limitation; authoring analysis can still accept the source, and future backends can provide their own declaration ordering.

GLES also moves replacement uniforms, struct declarations, and their enclosing conditions ahead of inherited references when their macro and precision context remains unchanged. Mutually exclusive functions that need different signatures at a shared forward-declaration site, and declarations that cross a macro or precision change, report `UnsupportedForwardDeclaration`.

When static inheritance coverage remains unknown, the instruction stream selects declarations using the actual macro state at their original source positions. The active declaration in the narrowest ShaderLab scope wins; macro directives still execute in source order. This applies to functions, uniforms, ordinary structs, and generated IO declarations. Forward declarations and moved types retain the ownership of their original declarations.

`ShaderCompiler.generate()` returns these variant-selectable instruction streams alongside unselected `vertex` and `fragment` text for inspection. The text views alone do not contain deferred ownership and must not be re-encoded as a substitute for the returned instructions. Engine `ShaderPass` consumes the instructions to produce final GLSL. `.shaderc` preserves the instructions as JSON. Engine versions that support the optional layout metadata also accept older assets with the original instruction opcodes.

## Declaration dependencies

The neutral parser records exact struct dependencies at each type occurrence, including possible macro replacement types. Macro-dependent types retain conservative semantic typing; their dependency identities do not select a runtime macro variant. GLES consumes these facts while generating reachable declarations, including helper signatures and nested struct fields, without a second declaration-tree scan.

Global emission is deduplicated by declaration identity. Same-named structs, functions, and uniforms in different macro branches remain separate candidates, retain their original guards and positions, and can discover further dependencies during generation. Backend-owned return lowering preserves control flow by emitting a block when a single return becomes an output assignment followed by an exit.

## CFG Grammar conflict detection

The Galacean shader syntax is defined using Context-Free Grammar (CFG) and is documented within the `\*.y` file. When modifications to the shader syntax are required, it is recommended to make changes to the existing CFG syntax file, and employ [Bison](https://www.gnu.org/software/bison/manual/bison.html) to detect any potential grammar conflicts.

```sh
bison ./Parser.y -r all
```
