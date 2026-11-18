# @galacean/engine-shader-analyzer

Standalone ShaderLab and ESSL diagnostics for authoring tools. The analyzer runs in Node.js and editors without a browser or Engine instance. Its public TypeScript declarations require no DOM library. It does not participate in runtime shader code generation.

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

When diagnostics and code generation are both needed, pass the parser-owned handles from the same result directly to the compiler. No ShaderLab pass is parsed a second time:

```ts
import { ShaderLanguage } from "@galacean/engine-core";
import { ShaderAnalyzer } from "@galacean/engine-shader-analyzer";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";

const analysis = ShaderAnalyzer.analyze(shaderSource);
const compiler = new ShaderCompiler();
const programs = analysis.passes.map((pass) => compiler.generate(pass, ShaderLanguage.GLSLES300));
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

The parser retains neutral typed IR and stage-interface facts. GLES output types and struct-flattening constraints are checked separately by a shared GLES policy used by diagnostics and code generation. Future backends can consume the same IR with their own lowering rules; WGSL generation is not implemented.

Diagnostic lines and columns are one-based for display. Offsets are zero-based so editors can map ranges directly onto their text models.

Include expansion is limited to 128 nested includes, 8,388,608 expanded characters, and 65,536 source segments per pass. Exceeding a limit produces a source-attributed `PreprocessorError`; partial output is discarded. The same limits apply to runtime and offline compilation.

## CLI

If the dependency packages already exist in the npm cache, install the analyzer tarball directly:

```sh
npm install --offline ./galacean-engine-shader-analyzer-*.tgz
```

For a fully disconnected install with an empty cache, provide the analyzer and its runtime dependency tarballs together:

```sh
npm install --offline \
  ./galacean-engine-math-*.tgz \
  ./galacean-engine-design-*.tgz \
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
