declare const parsedShaderPassBrand: unique symbol;

/**
 * Opaque, immutable handle for a parsed ShaderLab pass.
 *
 * Passes returned by `ShaderAnalyzer.analyze()` can be supplied to `ShaderCompiler.generate()`
 * without parsing the source again or exposing parser internals.
 */
export interface ParsedShaderPass {
  readonly [parsedShaderPassBrand]: never;
}
