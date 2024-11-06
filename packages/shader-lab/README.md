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

## CFG Grammar conflict detection

The Galacean ShaderLab syntax is defined using Context-Free Grammar (CFG) and is documented within the `\*.y` file. When modifications to the ShaderLab syntax are required, it is recommended to make changes to the existing CFG syntax file, and employ [Bison](https://www.gnu.org/software/bison/manual/bison.html) to detect any potential grammar conflicts.

```sh
bison ./Parser.y -r all
```
