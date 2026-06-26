/**
 * Semantic classification of a shader diagnostic, exposed to consumers (IDE/LSP)
 * in place of a numeric code — glslang-style. Flat, self-describing, never reused;
 * severity (error/warning) is a separate field. Producers (parser/codegen) stamp it.
 */
export enum DiagnosticType {
  // Syntax
  SyntaxError = "SyntaxError",

  // Symbol
  UndefinedFunction = "UndefinedFunction",
  NoMatchingOverload = "NoMatchingOverload",
  Redefinition = "Redefinition",
  UseBeforeDeclaration = "UseBeforeDeclaration",

  // Type
  InvalidSwizzle = "InvalidSwizzle",
  UndeclaredStructMember = "UndeclaredStructMember",
  AssignTypeMismatch = "AssignTypeMismatch",
  ReturnTypeMismatch = "ReturnTypeMismatch",
  ArrayOfArray = "ArrayOfArray",

  // Function
  ReturnInVoidFunction = "ReturnInVoidFunction",
  MissingReturn = "MissingReturn",

  // Pipeline (vertex/fragment IO)
  InvalidVaryingStruct = "InvalidVaryingStruct",
  InvalidAttributeStruct = "InvalidAttributeStruct",
  InvalidMrtStruct = "InvalidMrtStruct",
  VertexEntryReturnType = "VertexEntryReturnType",
  FragmentEntryReturnType = "FragmentEntryReturnType",
  StructRoleConflict = "StructRoleConflict",
  DuplicateEntryAssignment = "DuplicateEntryAssignment",
  MissingEntry = "MissingEntry",
  GlFragColorWithMrt = "GlFragColorWithMrt",
  GlFragData = "GlFragData",

  // RenderState
  InvalidRenderStateProperty = "InvalidRenderStateProperty",
  InvalidEnumValue = "InvalidEnumValue",
  BitwiseOrOnNonBitmask = "BitwiseOrOnNonBitmask",
  MixedEnumTypes = "MixedEnumTypes",
  InvalidRenderStateVariable = "InvalidRenderStateVariable",
  InvalidRenderQueueVariable = "InvalidRenderQueueVariable"
}
