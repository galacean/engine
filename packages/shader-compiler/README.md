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

## CFG Grammar conflict detection

The Galacean shader syntax is defined using Context-Free Grammar (CFG) and is documented within the `\*.y` file. When modifications to the shader syntax are required, it is recommended to make changes to the existing CFG syntax file, and employ [Bison](https://www.gnu.org/software/bison/manual/bison.html) to detect any potential grammar conflicts.

```sh
bison ./Parser.y -r all
```
