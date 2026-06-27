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
  ConstDivideByZero = "ConstDivideByZero",
  ShiftOutOfRange = "ShiftOutOfRange",
  IndexOutOfBounds = "IndexOutOfBounds",
  NonIntegerIndex = "NonIntegerIndex",
  NonIndexableType = "NonIndexableType",
  ExpectedSampler = "ExpectedSampler",
  InvalidUnaryOperand = "InvalidUnaryOperand",
  InvalidBinaryOperands = "InvalidBinaryOperands",
  ConstructorArgType = "ConstructorArgType",
  ConstructorArgCount = "ConstructorArgCount",
  NonConstInitializer = "NonConstInitializer",
  NonConstArraySize = "NonConstArraySize",

  // Function / control flow
  InvalidReturnType = "InvalidReturnType",
  MissingReturn = "MissingReturn",
  NonBoolCondition = "NonBoolCondition",
  RecursiveFunction = "RecursiveFunction",
  NonConstructibleReturnType = "NonConstructibleReturnType",
  MisplacedControlFlow = "MisplacedControlFlow",

  // Pipeline (vertex/fragment IO)
  InvalidIOStruct = "InvalidIOStruct",
  InvalidEntryReturnType = "InvalidEntryReturnType",
  StructRoleConflict = "StructRoleConflict",
  DuplicateEntryAssignment = "DuplicateEntryAssignment",
  MissingEntry = "MissingEntry",
  EntryNotFound = "EntryNotFound",
  GlFragColorWithMrt = "GlFragColorWithMrt",
  GlFragData = "GlFragData",
  NestedIOStruct = "NestedIOStruct",
  MissingVertexPosition = "MissingVertexPosition",
  NonFlatIntegerVarying = "NonFlatIntegerVarying",

  // RenderState
  InvalidRenderStateProperty = "InvalidRenderStateProperty",
  InvalidEnumValue = "InvalidEnumValue",
  BitwiseOrOnNonBitmask = "BitwiseOrOnNonBitmask",
  MixedEnumTypes = "MixedEnumTypes",
  InvalidRenderStateVariable = "InvalidRenderStateVariable",
  InvalidRenderQueueVariable = "InvalidRenderQueueVariable"
}
