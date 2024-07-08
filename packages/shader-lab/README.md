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

## Development & Debug
