/**
 * Backend-neutral meanings of stage IO builtins recognized by the parser.
 *
 * Source-language spellings remain on tokens for diagnostics and source reproduction; consumers
 * use these values when behavior depends on the builtin's meaning.
 * @internal
 */
export enum ShaderBuiltinSemantic {
  VertexPosition = "vertex-position",
  FragmentOutput0 = "fragment-output-0",
  FragmentOutputArray = "fragment-output-array",
  FragmentDepth = "fragment-depth"
}
