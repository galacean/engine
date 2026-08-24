# @galacean/engine-shader-analyzer

Standalone ShaderLab and ESSL diagnostics for authoring tools. The analyzer does not create an Engine instance and does not participate in runtime shader code generation.

## JavaScript API

```ts
import { DiagnosticSeverity, ShaderAnalyzer } from "@galacean/engine-shader-analyzer";

const { diagnostics } = ShaderAnalyzer.analyze(shaderSource, {
  includeMap: {
    "ShaderLibrary/Common.glsl": commonSource
  }
});

const hasErrors = diagnostics.some(({ severity }) => severity === DiagnosticSeverity.Error);
```

`sourceFile` is optional metadata, not a requirement for analysis. Without it, `./Common.glsl` resolves from the logical include-registry root. Supply it when relative includes should resolve from a logical subdirectory or when an editor needs stable source attribution:

```ts
const { diagnostics } = ShaderAnalyzer.analyze(shaderSource, {
  sourceFile: "Assets/Shaders/PBR.shader",
  includeMap: {
    "Assets/Shaders/Common.glsl": commonSource
  }
});
```

The analyzer expands the complete root once. Diagnostics are then mapped back to the owning Shader or ShaderChunk; include fragments are never analyzed in isolation.

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

Analyze a file. Without `--include-root`, includes resolve from the input file's directory:

```sh
galacean-shader-analyzer Assets/Shaders/PBR.shader
```

Use `--include-root` when project-root include keys must resolve from a broader shader directory:

```sh
galacean-shader-analyzer --include-root Assets/Shaders Assets/Shaders/PBR.shader
```

Read from stdin and return structured JSON:

```sh
galacean-shader-analyzer --json - < Assets/Shaders/PBR.shader
```

The file argument may be omitted to read stdin. The CLI exits with `0` when there are no error diagnostics (warnings are allowed), `1` when at least one error is present, and `2` for invalid command-line usage.

Run `galacean-shader-analyzer --help` for the complete command reference.
