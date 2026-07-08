import { DiagnosticType } from "@galacean/engine-shader-parser";

/**
 * Coarse-grained category a `DiagnosticType` belongs to — the top-level bucket the diagnostic reports
 * against. Mirrors a tiered error taxonomy (outer category = bucket, inner detail = specific rule), but
 * flattened to one enum because our checks are per-node rather than per-IR-item.
 */
export enum DiagnosticCategory {
  Syntax = "syntax",
  Symbol = "symbol",
  Type = "type",
  Constant = "constant",
  ControlFlow = "controlFlow",
  PipelineIO = "pipelineIO",
  RenderState = "renderState"
}

/**
 * Category of each DiagnosticType. Consumers (playground, IDE integrations, docs) read categorization
 * from here — do not maintain category info elsewhere.
 */
export const DIAGNOSTIC_CATEGORY: Record<DiagnosticType, DiagnosticCategory> = {
  [DiagnosticType.SyntaxError]: DiagnosticCategory.Syntax,

  [DiagnosticType.UndefinedFunction]: DiagnosticCategory.Symbol,
  [DiagnosticType.NoMatchingOverload]: DiagnosticCategory.Symbol,
  [DiagnosticType.Redefinition]: DiagnosticCategory.Symbol,
  [DiagnosticType.UseBeforeDeclaration]: DiagnosticCategory.Symbol,
  [DiagnosticType.RecursiveFunction]: DiagnosticCategory.Symbol,

  [DiagnosticType.InvalidSwizzle]: DiagnosticCategory.Type,
  [DiagnosticType.UndeclaredStructMember]: DiagnosticCategory.Type,
  [DiagnosticType.AssignTypeMismatch]: DiagnosticCategory.Type,
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
