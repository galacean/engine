import type { GalaceanDataType, ShaderRange } from "../common";
import type { BranchCoverage, DeclarationCoexistence } from "../common/BaseToken";
import { GSErrorName } from "../GSError";
import { ShaderCompilerUtils } from "../ShaderCompilerUtils";
import { TypeSystem } from "./TypeSystem";
import type { SemanticAmbiguityKind, SemanticDiagnostics } from "./SemanticDiagnostics";

class ParserSemanticDiagnostics implements SemanticDiagnostics {
  constructor(
    private _source: string,
    private readonly _includeAmbiguityDiagnostics: boolean
  ) {}

  setSource(source: string): void {
    this._source = source;
  }

  redefinition(
    location: ShaderRange,
    name: string,
    conflict: Exclude<DeclarationCoexistence, "exclusive"> | "none"
  ): Error | undefined {
    if (conflict === "coexist") {
      return this._create(`Redefinition of '${name}'.`, location, "Redefinition");
    }
  }

  branchAvailability(
    location: ShaderRange,
    subjectKind: "Function" | "Struct" | "Identifier",
    name: string,
    coverage: BranchCoverage
  ): Error | undefined {
    if (coverage !== "uncovered") return;
    const subject = `${subjectKind} '${name}'`;
    return this._create(
      `${subject} is unavailable under at least one macro configuration reaching this reference.`,
      location,
      "UseBeforeDeclaration"
    );
  }

  branchAmbiguity(location: ShaderRange, kind: SemanticAmbiguityKind, name: string, owner?: string): Error | undefined {
    if (!this._includeAmbiguityDiagnostics) return;
    switch (kind) {
      case "const-qualification":
        return this._create(
          `Symbol '${name}' has conflicting const qualification across macro branches; constant-expression validation disabled at this reference.`,
          location,
          "AmbiguousMacroBranchResolution"
        );
      case "struct-member-presence":
        return this._create(
          `Member '${name}' is missing from at least one reachable declaration of struct '${owner}'.`,
          location,
          "AmbiguousMacroBranchResolution"
        );
    }
  }

  nonConstArraySize(location: ShaderRange): Error | undefined {
    return this._create("Array size must be a constant expression.", location, "NonConstArraySize");
  }

  expectedSampler(location: ShaderRange, functionName: string, actualType: GalaceanDataType): Error | undefined {
    return this._create(
      `'${functionName}' expects a sampler as its first argument, got '${TypeSystem.typeName(actualType)}'.`,
      location,
      "ExpectedSampler"
    );
  }

  noMatchingOverload(location: ShaderRange, functionName: string): Error | undefined {
    return this._create(`No overload function type found: ${functionName}`, location, "NoMatchingOverload");
  }

  undeclaredStructMember(location: ShaderRange, structName: string, memberName: string): Error | undefined {
    return this._create(`'${memberName}' : no such field in '${structName}'`, location, "UndeclaredStructMember");
  }

  private _create(message: string, location: ShaderRange, code: string): Error {
    return ShaderCompilerUtils.createGSError(message, GSErrorName.CompilationError, this._source, location, code);
  }
}

/**
 * Creates a request-owned semantic diagnostic mapper.
 * @param source - Expanded pass source attached to parser diagnostics.
 * @returns Analyzer semantic diagnostic policy for one parser session.
 * @internal
 */
export function createAnalyzerSemanticDiagnostics(source: string): SemanticDiagnostics {
  return new ParserSemanticDiagnostics(source, true);
}

/**
 * Creates proven macro-declaration diagnostics that are safe to block offline generation.
 * @param source - Expanded pass source attached to parser diagnostics.
 * @returns Compiler semantic diagnostics for one parser session.
 * @internal
 */
export function createCompilerSemanticDiagnostics(source: string): SemanticDiagnostics {
  return new ParserSemanticDiagnostics(source, true);
}
