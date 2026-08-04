import { DiagnosticType } from "./DiagnosticType";

/** High-level category assigned to a diagnostic type. */
export enum DiagnosticCategory {
  Syntax = "syntax",
  Symbol = "symbol",
  Type = "type",
  Constant = "constant",
  ControlFlow = "controlFlow",
  PipelineIO = "pipelineIO",
  RenderState = "renderState"
}

/** Maps every diagnostic type to its high-level category. */
export const DIAGNOSTIC_CATEGORY: Record<DiagnosticType, DiagnosticCategory> = {
  [DiagnosticType.SyntaxError]: DiagnosticCategory.Syntax,
  [DiagnosticType.PreprocessorError]: DiagnosticCategory.Syntax,

  [DiagnosticType.UndefinedFunction]: DiagnosticCategory.Symbol,
  [DiagnosticType.UnknownVariable]: DiagnosticCategory.Symbol,
  [DiagnosticType.NoMatchingOverload]: DiagnosticCategory.Symbol,
  [DiagnosticType.Redefinition]: DiagnosticCategory.Symbol,
  [DiagnosticType.UseBeforeDeclaration]: DiagnosticCategory.Symbol,
  [DiagnosticType.RecursiveFunction]: DiagnosticCategory.Symbol,
  [DiagnosticType.LocalFunctionPrototype]: DiagnosticCategory.Symbol,
  [DiagnosticType.AmbiguousMacroBranchType]: DiagnosticCategory.Symbol,
  [DiagnosticType.AmbiguousMacroBranchResolution]: DiagnosticCategory.Symbol,

  [DiagnosticType.InvalidSwizzle]: DiagnosticCategory.Type,
  [DiagnosticType.UnknownType]: DiagnosticCategory.Type,
  [DiagnosticType.UndeclaredStructMember]: DiagnosticCategory.Type,
  [DiagnosticType.AssignTypeMismatch]: DiagnosticCategory.Type,
  [DiagnosticType.InvalidAssignmentTarget]: DiagnosticCategory.Type,
  [DiagnosticType.ConstDivideByZero]: DiagnosticCategory.Type,
  [DiagnosticType.ShiftOutOfRange]: DiagnosticCategory.Type,
  [DiagnosticType.IndexOutOfBounds]: DiagnosticCategory.Type,
  [DiagnosticType.NonIntegerIndex]: DiagnosticCategory.Type,
  [DiagnosticType.NonIndexableType]: DiagnosticCategory.Type,
  [DiagnosticType.ExpectedSampler]: DiagnosticCategory.Type,
  [DiagnosticType.InvalidUnaryOperand]: DiagnosticCategory.Type,
  [DiagnosticType.InvalidBinaryOperands]: DiagnosticCategory.Type,
  [DiagnosticType.ConstructorArgType]: DiagnosticCategory.Type,
  [DiagnosticType.ConstructorArgCount]: DiagnosticCategory.Type,
  [DiagnosticType.EmptyStruct]: DiagnosticCategory.Type,
  [DiagnosticType.InvalidArraySize]: DiagnosticCategory.Type,
  [DiagnosticType.InvalidVoidVariable]: DiagnosticCategory.Type,
  [DiagnosticType.NonFloatDerivativeArg]: DiagnosticCategory.Type,

  [DiagnosticType.NonConstInitializer]: DiagnosticCategory.Constant,
  [DiagnosticType.NonConstArraySize]: DiagnosticCategory.Constant,
  [DiagnosticType.NonConstructibleReturnType]: DiagnosticCategory.Constant,

  [DiagnosticType.InvalidReturnType]: DiagnosticCategory.ControlFlow,
  [DiagnosticType.MissingReturn]: DiagnosticCategory.ControlFlow,
  [DiagnosticType.NonBoolCondition]: DiagnosticCategory.ControlFlow,
  [DiagnosticType.MisplacedControlFlow]: DiagnosticCategory.ControlFlow,
  [DiagnosticType.InvalidEntryReturnType]: DiagnosticCategory.ControlFlow,
  [DiagnosticType.DerivativeInVertexShader]: DiagnosticCategory.ControlFlow,

  [DiagnosticType.InvalidIOStruct]: DiagnosticCategory.PipelineIO,
  [DiagnosticType.StructRoleConflict]: DiagnosticCategory.PipelineIO,
  [DiagnosticType.DuplicateEntryAssignment]: DiagnosticCategory.PipelineIO,
  [DiagnosticType.MissingEntry]: DiagnosticCategory.PipelineIO,
  [DiagnosticType.EntryNotFound]: DiagnosticCategory.PipelineIO,
  [DiagnosticType.GlFragColorWithMrt]: DiagnosticCategory.PipelineIO,
  [DiagnosticType.BareGlFragData]: DiagnosticCategory.PipelineIO,
  [DiagnosticType.NestedIOStruct]: DiagnosticCategory.PipelineIO,
  [DiagnosticType.MissingVertexPosition]: DiagnosticCategory.PipelineIO,
  [DiagnosticType.NonFlatIntegerVarying]: DiagnosticCategory.PipelineIO,

  [DiagnosticType.InvalidRenderStateProperty]: DiagnosticCategory.RenderState,
  [DiagnosticType.InvalidEnumValue]: DiagnosticCategory.RenderState,
  [DiagnosticType.BitwiseOrOnNonBitmask]: DiagnosticCategory.RenderState,
  [DiagnosticType.MixedEnumTypes]: DiagnosticCategory.RenderState,
  [DiagnosticType.InvalidRenderStateVariable]: DiagnosticCategory.RenderState,
  [DiagnosticType.InvalidRenderQueueVariable]: DiagnosticCategory.RenderState
};
