/**
 * Backend-neutral meanings of stage IO and limit builtins recognized by the parser.
 *
 * Source-language spellings remain on tokens for diagnostics and source reproduction; consumers
 * use these values when behavior depends on the builtin's meaning.
 * @internal
 */
export enum ShaderBuiltinSemantic {
  VertexPosition = "vertex-position",
  VertexID = "vertex-id",
  InstanceID = "instance-id",
  PointSize = "point-size",
  FragCoord = "frag-coord",
  FrontFacing = "front-facing",
  PointCoord = "point-coord",
  FragmentOutput0 = "fragment-output-0",
  FragmentOutputArray = "fragment-output-array",
  FragmentDepth = "fragment-depth",
  GlobalInvocationID = "global-invocation-id",
  LocalInvocationID = "local-invocation-id",
  WorkGroupID = "workgroup-id",
  NumWorkGroups = "num-workgroups",
  LocalInvocationIndex = "local-invocation-index",
  BuiltinLimit = "builtin-limit"
}
