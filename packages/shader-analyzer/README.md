# @galacean/engine-shader-analyzer

Standalone ShaderLab and ESSL diagnostics for authoring tools. The analyzer does not create an Engine instance and does not participate in runtime shader code generation.

## JavaScript API

```ts
import { DiagnosticSeverity, ShaderAnalyzer } from "@galacean/engine-shader-analyzer";

const { diagnostics } = new ShaderAnalyzer().analyze(shaderSource, {
  file: "Assets/Shaders/PBR.shader",
  includeMap: {
    "ShaderLibrary/Common.glsl": commonSource
  },
  basePathForIncludeKey: "shaders://root/Assets/Shaders/"
});

const hasErrors = diagnostics.some(({ severity }) => severity === DiagnosticSeverity.Error);
```

Diagnostic lines and columns are one-based for display. Offsets are zero-based so editors can map ranges directly onto their text models.

## CLI

If the dependency packages already exist in the npm cache, install the analyzer tarball directly:

```sh
npm install --offline ./galacean-engine-shader-analyzer-*.tgz
```

For a fully disconnected install with an empty cache, provide the analyzer and its runtime dependency tarballs together:

```sh
npm install --offline \
  ./galacean-engine-math-*.tgz \
  ./galacean-engine-core-*.tgz \
  ./galacean-engine-shader-parser-*.tgz \
  ./galacean-engine-shader-analyzer-*.tgz
```

Analyze a file and resolve `#include` paths from a shader directory:

```sh
galacean-shader-analyzer --include-root Assets/Shaders Assets/Shaders/PBR.shader
```

Read from stdin and return structured JSON:

```sh
galacean-shader-analyzer --json - < Assets/Shaders/PBR.shader
```

The file argument may be omitted to read stdin. The CLI exits with `0` when there are no error diagnostics (warnings are allowed), `1` when at least one error is present, and `2` for invalid command-line usage.

Run `galacean-shader-analyzer --help` for the complete command reference.
