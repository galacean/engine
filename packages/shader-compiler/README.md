## Installation

```sh
npm install @galacean/engine-shader-compiler
```

## Usage

```typescript
import { ShaderCompiler } from "@galacean/engine-shader-compiler";

// Create shader compiler
const shaderCompiler = new ShaderCompiler();

// Create engine with shader compiler
const engine = await WebGLEngine.create({ canvas: "canvas", shaderCompiler });

......

// Create shader by galacean shader code directly
const shader = Shader.create(galaceanShaderCode);

.......

// Run engine
engine.run()
```

There are two versions of the shader compiler: `Release` and `Verbose`. The `Verbose` version offers more user-friendly diagnostic information for debugging shader compilation errors, while the Release version provides superior performance.

you can use `Verbose` version by import:

```ts
import { ShaderCompiler } from "@galacean/engine-shader-compiler/verbose";
```

## CFG Grammar conflict detection

The Galacean shader syntax is defined using Context-Free Grammar (CFG) and is documented within the `\*.y` file. When modifications to the shader syntax are required, it is recommended to make changes to the existing CFG syntax file, and employ [Bison](https://www.gnu.org/software/bison/manual/bison.html) to detect any potential grammar conflicts.

```sh
bison ./Parser.y -r all
```
