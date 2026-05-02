# Local enum copies

These enum files are deliberately maintained as **local copies**, not imports
from `@galacean/engine-core`.

## Why

`@galacean/engine-shader-compiler` is a standalone offline compiler — it
translates ShaderLab DSL strings into `.shaderc` JSON without depending on any
runtime engine package. This is the same architectural posture every mature
shader compiler in the industry takes (Unity ShaderCompiler.exe, Unreal
ShaderCompilerWorker, glslang, shaderc, DXC, Tint, Naga, SPIRV-Cross, ...).

Were the compiler to `import` enums from `engine-core`, it would also pull
the engine runtime into its dependency closure. That breaks two things:

1. **Cold-boot bootstrap**. The compiler is invoked during the engine build
   itself (to precompile built-in `.shader` files into `.shaderc`). If the
   compiler depends on engine dist, you can't build the engine without first
   having the engine dist — chicken-and-egg.
2. **Standalone usability**. Tools/IDE plugins/editors that want to invoke
   the compiler must otherwise drag in the entire engine runtime.

## The contract

These enums describe the **wire format** of `.shaderc` (numeric values
serialized into JSON). Engine runtime reads `.shaderc` and uses its own copy
of the same enums to deserialize. The two copies must stay numerically
identical — that is the format spec.

## When updating

If you add/remove/reorder a member of one of these enums, update **both**
copies in the same commit:

- `packages/shader-compiler/src/enums/<EnumName>.ts`
- `packages/core/src/shader/enums/<EnumName>.ts`

Drift would corrupt `.shaderc` deserialization in subtle, hard-to-detect ways
(specific shader features silently doing the wrong thing at runtime).
