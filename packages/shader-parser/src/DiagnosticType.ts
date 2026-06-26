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
  ConstDivideByZero = "ConstDivideByZero",
  ShiftOutOfRange = "ShiftOutOfRange",
  IndexOutOfBounds = "IndexOutOfBounds",
  InvalidUnaryOperand = "InvalidUnaryOperand",

  // Function / control flow
  ReturnInVoidFunction = "ReturnInVoidFunction",
  MissingReturn = "MissingReturn",
  NonBoolCondition = "NonBoolCondition",
  RecursiveFunction = "RecursiveFunction",
  NonConstructibleReturnType = "NonConstructibleReturnType",

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
  NestedIOStruct = "NestedIOStruct",

  // RenderState
  InvalidRenderStateProperty = "InvalidRenderStateProperty",
  InvalidEnumValue = "InvalidEnumValue",
  BitwiseOrOnNonBitmask = "BitwiseOrOnNonBitmask",
  MixedEnumTypes = "MixedEnumTypes",
  InvalidRenderStateVariable = "InvalidRenderStateVariable",
  InvalidRenderQueueVariable = "InvalidRenderQueueVariable"
}
