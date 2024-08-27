## Installation

```sh
npm install @galacean/engine-shader-lab
```

## Usage

```typescript
import { ShaderLab } from "@galacean/engine-shader-lab";

// Create ShaderLab
const shaderLab = new ShaderLab();

// Create engine with shaderLab
const engine = await WebGLEngine.create({ canvas: "canvas", shaderLab });

......

// Create shader by galacean shader code directly
const shader = Shader.create(galaceanShaderCode);

.......

// Run engine
engine.run()
```

There are two versions of ShaderLab: `Release` and `Debug`. The Debug version offers more user-friendly diagnostic information for debug ShaderLab compilation errors, while the Release version provides superior performance.

you can use debug version by import:

```ts
// umd
import { ShaderLab } from "@galacean/engine-shader-lab/dist/browser.editor";
// esmoudle
import { ShaderLab } from "@galacean/engine-shader-lab/dist/module.editor";
// commonjs
import { ShaderLab } from "@galacean/engine-shader-lab/dist/main.editor";
```

## CFG Grammar conflict detection

The Galacean ShaderLab syntax is defined using Context-Free Grammar (CFG) and is documented within the `\*.y` file. When modifications to the ShaderLab syntax are required, it is recommended to make changes to the existing CFG syntax file, and employ [Bison](https://www.gnu.org/software/bison/manual/bison.html) to detect any potential grammar conflicts.

```sh
bison ./Parser.y -r all
```
