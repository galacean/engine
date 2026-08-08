import type { GalaceanDataType, ShaderRange } from "../common";
import type { BranchCoverage, DeclarationCoexistence } from "../common/BaseToken";
import { GSErrorName } from "../GSError";
import { ShaderCompilerUtils } from "../ShaderCompilerUtils";
import { TypeSystem } from "./TypeSystem";
import type { SemanticAmbiguityKind, SemanticDiagnostics } from "./SemanticDiagnostics";

class AnalyzerSemanticDiagnostics implements SemanticDiagnostics {
  constructor(private readonly _source: string) {}

  redefinition(
    location: ShaderRange,
    name: string,
    conflict: Exclude<DeclarationCoexistence, "exclusive"> | "none"
  ): Error | undefined {
    if (conflict === "coexist") {
      return this._create(`Redefinition of '${name}'.`, location, "Redefinition");
    }
    if (conflict === "unknown") {
      return this._create(
        `Declaration '${name}' may overlap another macro-guarded declaration; align their branch conditions.`,
        location,
        "Redefinition",
        true
      );
    }
  }

  branchAvailability(
    location: ShaderRange,
    subjectKind: "Function" | "Struct" | "Identifier",
    name: string,
    coverage: BranchCoverage
  ): Error | undefined {
    if (coverage === "covered") return;
    const subject = `${subjectKind} '${name}'`;
    return coverage === "uncovered"
      ? this._create(
          `${subject} is unavailable under at least one macro configuration reaching this reference.`,
          location,
          "UseBeforeDeclaration"
        )
      : this._create(
          `${subject} may be unavailable under some macro configurations; align its declaration and reference conditions.`,
          location,
          "UseBeforeDeclaration",
          true
        );
  }

  branchAmbiguity(location: ShaderRange, kind: SemanticAmbiguityKind, name: string, owner?: string): Error {
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

  nonConstArraySize(location: ShaderRange): Error {
    return this._create("Array size must be a constant expression.", location, "NonConstArraySize");
  }

  expectedSampler(location: ShaderRange, functionName: string, actualType: GalaceanDataType): Error {
    return this._create(
      `'${functionName}' expects a sampler as its first argument, got '${TypeSystem.typeName(actualType)}'.`,
      location,
      "ExpectedSampler"
    );
  }

  noMatchingOverload(location: ShaderRange, functionName: string): Error {
    return this._create(`No overload function type found: ${functionName}`, location, "NoMatchingOverload");
  }

  undefinedFunction(location: ShaderRange, functionName: string): Error {
    return this._create(
      `Undefined function '${functionName}' — ensure it is provided at runtime as a macro.`,
      location,
      "UndefinedFunction",
      true
    );
  }

  undeclaredStructMember(location: ShaderRange, structName: string, memberName: string): Error {
    return this._create(`'${memberName}' : no such field in '${structName}'`, location, "UndeclaredStructMember");
  }

  unknownVariable(location: ShaderRange, name: string): Error {
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
  return new AnalyzerSemanticDiagnostics(source);
}
