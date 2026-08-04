/**
 * Semantic classification of a shader diagnostic.
 *
 * Severity is reported separately.
 */
export enum DiagnosticType {
  SyntaxError = "SyntaxError",
  PreprocessorError = "PreprocessorError",

  UndefinedFunction = "UndefinedFunction",
  UnknownVariable = "UnknownVariable",
  NoMatchingOverload = "NoMatchingOverload",
  Redefinition = "Redefinition",
  UseBeforeDeclaration = "UseBeforeDeclaration",
  LocalFunctionPrototype = "LocalFunctionPrototype",
  AmbiguousMacroBranchType = "AmbiguousMacroBranchType",
  AmbiguousMacroBranchResolution = "AmbiguousMacroBranchResolution",

  InvalidSwizzle = "InvalidSwizzle",
  UnknownType = "UnknownType",
  UndeclaredStructMember = "UndeclaredStructMember",
  AssignTypeMismatch = "AssignTypeMismatch",
  InvalidAssignmentTarget = "InvalidAssignmentTarget",
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
  EmptyStruct = "EmptyStruct",
  InvalidArraySize = "InvalidArraySize",
  InvalidVoidVariable = "InvalidVoidVariable",
  NonFloatDerivativeArg = "NonFloatDerivativeArg",

  InvalidReturnType = "InvalidReturnType",
  MissingReturn = "MissingReturn",
  NonBoolCondition = "NonBoolCondition",
  RecursiveFunction = "RecursiveFunction",
  NonConstructibleReturnType = "NonConstructibleReturnType",
  MisplacedControlFlow = "MisplacedControlFlow",
  DerivativeInVertexShader = "DerivativeInVertexShader",

  InvalidIOStruct = "InvalidIOStruct",
  InvalidEntryReturnType = "InvalidEntryReturnType",
  StructRoleConflict = "StructRoleConflict",
  DuplicateEntryAssignment = "DuplicateEntryAssignment",
  MissingEntry = "MissingEntry",
  EntryNotFound = "EntryNotFound",
  GlFragColorWithMrt = "GlFragColorWithMrt",
  BareGlFragData = "BareGlFragData",
  NestedIOStruct = "NestedIOStruct",
  MissingVertexPosition = "MissingVertexPosition",
  NonFlatIntegerVarying = "NonFlatIntegerVarying",

  InvalidRenderStateProperty = "InvalidRenderStateProperty",
  InvalidEnumValue = "InvalidEnumValue",
  BitwiseOrOnNonBitmask = "BitwiseOrOnNonBitmask",
  MixedEnumTypes = "MixedEnumTypes",
  InvalidRenderStateVariable = "InvalidRenderStateVariable",
  InvalidRenderQueueVariable = "InvalidRenderQueueVariable"
}
