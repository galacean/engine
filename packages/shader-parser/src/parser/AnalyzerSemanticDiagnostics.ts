import type { GalaceanDataType, ShaderRange } from "../common";
import type { BranchCoverage, BranchSignature, DeclarationCoexistence } from "../common/BaseToken";
import { GSErrorName } from "../GSError";
import { ShaderCompilerUtils } from "../ShaderCompilerUtils";
import { TypeSystem } from "./TypeSystem";
import type { SemanticAmbiguityKind, SemanticDiagnostics } from "./SemanticDiagnostics";

class ParserSemanticDiagnostics implements SemanticDiagnostics {
  constructor(
    private _source: string,
    private readonly _includeAnalyzerDiagnostics: boolean
  ) {}

  setSource(source: string): void {
    this._source = source;
  }

  redefinition(
    location: ShaderRange,
    name: string,
    conflict: Exclude<DeclarationCoexistence, "exclusive"> | "none",
    branch: BranchSignature
  ): Error | undefined {
    if (!this._includeAnalyzerDiagnostics && branch.length === 0) return;
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
    if (!this._includeAnalyzerDiagnostics) return;
    if (coverage !== "uncovered") return;
    const subject = `${subjectKind} '${name}'`;
    return this._create(
      `${subject} is unavailable under at least one macro configuration reaching this reference.`,
      location,
      "UseBeforeDeclaration"
    );
  }

  branchAmbiguity(location: ShaderRange, kind: SemanticAmbiguityKind, name: string, owner?: string): Error | undefined {
    if (!this._includeAnalyzerDiagnostics) return;
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
      case "struct-member-type":
        return this._create(
          `Member '${name}' has divergent types across declarations of struct '${owner}'; type inference is disabled at this reference.`,
          location,
          "AmbiguousMacroBranchType",
          true
        );
      case "symbol-type":
        return this._create(
          `Symbol '${name}' resolves to multiple declarations with divergent types across macro branches; type inference disabled at this reference.`,
          location,
          "AmbiguousMacroBranchType",
          true
        );
    }
  }

  nonConstArraySize(location: ShaderRange): Error | undefined {
    if (!this._includeAnalyzerDiagnostics) return;
    return this._create("Array size must be a constant expression.", location, "NonConstArraySize");
  }

  expectedSampler(location: ShaderRange, functionName: string, actualType: GalaceanDataType): Error | undefined {
    if (!this._includeAnalyzerDiagnostics) return;
    return this._create(
      `'${functionName}' expects a sampler as its first argument, got '${TypeSystem.typeName(actualType)}'.`,
      location,
      "ExpectedSampler"
    );
  }

  noMatchingOverload(location: ShaderRange, functionName: string): Error | undefined {
    if (!this._includeAnalyzerDiagnostics) return;
    return this._create(`No overload function type found: ${functionName}`, location, "NoMatchingOverload");
  }

  undefinedFunction(location: ShaderRange, functionName: string): Error | undefined {
    if (!this._includeAnalyzerDiagnostics) return;
    return this._create(
      `Undefined function '${functionName}' — ensure it is provided at runtime as a macro.`,
      location,
      "UndefinedFunction",
      true
    );
  }

  undeclaredStructMember(location: ShaderRange, structName: string, memberName: string): Error | undefined {
    if (!this._includeAnalyzerDiagnostics) return;
    return this._create(`'${memberName}' : no such field in '${structName}'`, location, "UndeclaredStructMember");
  }

  unknownVariable(location: ShaderRange, name: string): Error | undefined {
    if (!this._includeAnalyzerDiagnostics) return;
    return this._create(
      `Undeclared identifier '${name}' — ensure it is provided at runtime as a macro.`,
      location,
      "UnknownVariable",
      true
    );
  }

  private _create(message: string, location: ShaderRange, code: string, warning = false): Error {
    return ShaderCompilerUtils.createGSError(
      message,
      warning ? GSErrorName.CompilationWarn : GSErrorName.CompilationError,
      this._source,
      location,
      code
    );
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
  return new ParserSemanticDiagnostics(source, false);
}
