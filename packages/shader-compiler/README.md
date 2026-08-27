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

`Shader.create()` never needs a filesystem path. Include paths are resolved against logical keys registered through
`ShaderFactory.registerInclude()`:

| Registered key | Current logical shader | `#include` | Result |
| --- | --- | --- | --- |
| `User/Math.glsl` | no loader metadata | `"User/Math.glsl"` or `"/User/Math.glsl"` | `User/Math.glsl` |
| `User/Math.glsl` | no loader metadata | `"./User/Math.glsl"` | `User/Math.glsl` |
| `Assets/Shaders/Math.glsl` | `Assets/Shaders/PBR.shader` | `"./Math.glsl"` | `Assets/Shaders/Math.glsl` |
| `Assets/Shared/Math.glsl` | `Assets/Shaders/PBR.shader` | `"../Shared/Math.glsl"` | `Assets/Shared/Math.glsl` |

The asset loader supplies the current logical shader location internally. Moving a shader folder remains valid when
the shader asset and its registered include keys move together. Disk paths do not define the logical root.

## Offline precompile

Compile a directory tree to `.shaderc` artifacts:

```sh
shader-compiler-precompile Assets/Shaders build/shaders --clean --emit-index
```

The input directory is the logical registry root. A shader at `PBR/Root.shader` resolves `./Common.glsl` to
`PBR/Common.glsl`; `/Shared/Math.glsl` and `Shared/Math.glsl` both resolve to `Shared/Math.glsl` below the input root.
Compilation failures exit non-zero and prevent Rollup builds using the plugin from succeeding.

## CFG Grammar conflict detection

The Galacean shader syntax is defined using Context-Free Grammar (CFG) and is documented within the `\*.y` file. When modifications to the shader syntax are required, it is recommended to make changes to the existing CFG syntax file, and employ [Bison](https://www.gnu.org/software/bison/manual/bison.html) to detect any potential grammar conflicts.

```sh
bison ./Parser.y -r all
```
