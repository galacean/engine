import type { GalaceanDataType, ShaderRange } from "../common";
import type { BranchCoverage, BranchSignature, DeclarationCoexistence } from "../common/BaseToken";

/**
 * Analyzer-only ambiguity categories emitted while semantic facts are projected.
 * @internal
 */
export type SemanticAmbiguityKind = "const-qualification" | "struct-member-presence";

/**
 * Structured parser facts mapped to analyzer or offline-compiler diagnostics.
 * @internal
 */
export interface SemanticDiagnostics {
  /**
   * Replaces the expanded source attached to subsequent diagnostics.
   * @param source - Expanded shader-pass source for the current parser request.
   * @internal
   */
  setSource?(source: string): void;
  /**
   * Maps a declaration conflict to a diagnostic.
   * @param location - Declaration range.
   * @param name - Declared symbol name.
   * @param conflict - Proven or unresolved coexistence state.
   * @param branch - Macro branch containing the later declaration.
   * @returns A diagnostic when the conflict is reportable.
   * @internal
   */
  redefinition(
    location: ShaderRange,
    name: string,
    conflict: Exclude<DeclarationCoexistence, "exclusive"> | "none",
    branch: BranchSignature
  ): Error | undefined;
  /**
   * Maps declaration coverage to a reference diagnostic.
   * @param location - Reference range.
   * @param subjectKind - Referenced declaration category.
   * @param name - Referenced symbol name.
   * @param coverage - Proven or unresolved coverage state.
   * @returns A diagnostic when absence is proven.
   * @internal
   */
  branchAvailability(
    location: ShaderRange,
    subjectKind: "Function" | "Struct" | "Identifier",
    name: string,
    coverage: BranchCoverage
  ): Error | undefined;
  /**
   * Creates an ambiguity diagnostic for one semantic projection.
   * @param location - Ambiguous reference range.
   * @param kind - Ambiguity category.
   * @param name - Symbol or member name.
   * @param owner - Optional owning struct name.
   * @returns The mapped ambiguity diagnostic.
   * @internal
   */
  branchAmbiguity?(location: ShaderRange, kind: SemanticAmbiguityKind, name: string, owner?: string): Error | undefined;
  /**
   * Creates a non-constant array-size diagnostic.
   * @param location - Array-size range.
   * @returns The mapped diagnostic.
   * @internal
   */
  nonConstArraySize?(location: ShaderRange): Error | undefined;
  /**
   * Creates a sampler-argument diagnostic.
   * @param location - Call range.
   * @param functionName - Texture function name.
   * @param actualType - First argument type.
   * @returns The mapped diagnostic.
   * @internal
   */
  expectedSampler?(location: ShaderRange, functionName: string, actualType: GalaceanDataType): Error | undefined;
  /**
   * Creates an overload-resolution diagnostic.
   * @param location - Call range.
   * @param functionName - Called function name.
   * @returns The mapped diagnostic.
   * @internal
   */
  noMatchingOverload?(location: ShaderRange, functionName: string): Error | undefined;
  /**
   * Creates an unknown-struct-member diagnostic.
   * @param location - Member range.
   * @param structName - Struct type name.
   * @param memberName - Referenced member name.
   * @returns The mapped diagnostic.
   * @internal
   */
  undeclaredStructMember?(location: ShaderRange, structName: string, memberName: string): Error | undefined;
}
