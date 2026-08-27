import {
  GSError,
  GSErrorName,
  Keyword,
  ShaderCompilerUtils,
  ShaderBuiltinSemantic,
  ShaderStructRole,
  type StructSymbol,
  TypeSystem,
  ShaderPosition,
  type ShaderRange
} from "@galacean/engine-shader-parser/internal/analyzer";
import type { ShaderAnalysisInfo } from "./ShaderAnalysisInfo";
import { DiagnosticType } from "./DiagnosticType";

const zeroPosition = new ShaderPosition();
zeroPosition.set(0, 0, 0);
Object.freeze(zeroPosition);

/**
 * Validates pipeline IO facts produced by `ShaderCoreInfo`.
 * @internal
 */
export class ShaderIOValidator {
  /**
   * Validates stage entries and IO without participating in backend generation.
   * @param analysis - Analyzer-only facts and their neutral/core backing data.
   * @param vertexEntryLocation - ShaderLab source range of the vertex entry binding.
   * @param fragmentEntryLocation - ShaderLab source range of the fragment entry binding.
   * @param entrySource - Complete ShaderLab source containing the entry bindings.
   * @returns Analyzer errors for invalid pipeline IO.
   */
  static validate(
    analysis: ShaderAnalysisInfo,
    vertexEntryLocation?: ShaderRange | ShaderPosition,
    fragmentEntryLocation?: ShaderRange | ShaderPosition,
    entrySource?: string
  ): GSError[] {
    const { ir, coreInfo } = analysis;
    const source = ir.source;
    const errors: GSError[] = [];

    if (coreInfo.vertexEntry.name && !coreInfo.vertexEntry.functions.length) {
      this._entryNotFound(errors, coreInfo.vertexEntry.name, vertexEntryLocation, entrySource ?? source);
    }
    if (coreInfo.fragmentEntry.name && !coreInfo.fragmentEntry.functions.length) {
      this._entryNotFound(errors, coreInfo.fragmentEntry.name, fragmentEntryLocation, entrySource ?? source);
    }
    if (coreInfo.vertexEntry.hasDefiniteAmbiguity) {
      this._ambiguousEntry(
        errors,
        coreInfo.vertexEntry.name,
        vertexEntryLocation,
        entrySource,
        coreInfo.vertexEntry.functions[1].astNode.protoType.ident.location,
        source
      );
    }
    if (coreInfo.fragmentEntry.hasDefiniteAmbiguity) {
      this._ambiguousEntry(
        errors,
        coreInfo.fragmentEntry.name,
        fragmentEntryLocation,
        entrySource,
        coreInfo.fragmentEntry.functions[1].astNode.protoType.ident.location,
        source
      );
    }

    this._validateVertex(analysis, errors);
    this._validateFragment(analysis, errors);
    this._validateRoleConflicts(analysis, errors);
    this._validateStructMembers(analysis, errors);
    this._validateMrtOutputs(analysis, errors);
    for (const location of coreInfo.invalidMrtReturnLocations) {
      this._error(
        errors,
        DiagnosticType.InvalidMrtOutput,
        "MRT fragment entries must return a struct variable after assigning its members.",
        location,
        source
      );
    }
    for (const location of coreInfo.invalidVaryingReturnLocations) {
      this._error(
        errors,
        DiagnosticType.InvalidEntryReturnType,
        "Vertex entries returning varyings must return a struct variable or a function result of the same type.",
        location,
        source
      );
    }
    for (const issue of coreInfo.structMemberOwnerIssues) {
      if (issue.certainty !== "definite") continue;
      this._error(
        errors,
        DiagnosticType.AmbiguousMacroBranchResolution,
        issue.kind === "runtime-expanded-io-owner"
          ? "This macro member owner resolves to stage IO only after runtime substitution and cannot be lowered safely."
          : "This member reference may resolve to stage IO or an ordinary variable across runtime macro configurations.",
        issue.location,
        source
      );
    }

    for (const fragmentFunction of coreInfo.fragmentEntry.functions) {
      const returnStructs = fragmentFunction.astNode.protoType.returnType.typeSpecifier.structDeclarations;
      const returnsMrt = returnStructs.some((struct) => coreInfo.io.mrtStructs.includes(struct));
      if (!returnsMrt) continue;
      const reachableFragmentOutputs = analysis.reachableFragmentOutput0ReferencesFrom(fragmentFunction);
      if (reachableFragmentOutputs.length) {
        this._error(
          errors,
          DiagnosticType.GlFragColorWithMrt,
          "gl_FragColor cannot be used with MRT (Multiple Render Targets).",
          reachableFragmentOutputs[0],
          source
        );
        break;
      }
    }

    for (const fragmentFunction of coreInfo.fragmentEntry.functions) {
      const conflict = analysis.coexistingLegacyFragmentOutputsFrom(fragmentFunction);
      if (!conflict) continue;
      this._error(
        errors,
        DiagnosticType.LegacyFragmentOutputConflict,
        "gl_FragColor and gl_FragData cannot be used in the same fragment shader configuration.",
        conflict.outputArray,
        source
      );
      break;
    }

    if (
      coreInfo.vertexEntry.functions.length &&
      analysis.getReachableWriteCoverage(coreInfo.vertexEntry, ShaderBuiltinSemantic.VertexPosition) === "uncovered"
    ) {
      this._error(
        errors,
        DiagnosticType.MissingVertexPosition,
        "Vertex shader must write gl_Position.",
        coreInfo.vertexEntry.functions[0].astNode.protoType.returnType.location,
        source
      );
    }

    return errors;
  }

  private static _validateVertex(analysis: ShaderAnalysisInfo, errors: GSError[]): void {
    const { coreInfo, ir } = analysis;
    for (const functionSymbol of coreInfo.vertexEntry.functions) {
      const proto = functionSymbol.astNode.protoType;
      const returnType = proto.returnType;
      if (typeof returnType.type === "string") {
        if (!returnType.typeSpecifier.structDeclarations.length) {
          this._error(
            errors,
            DiagnosticType.InvalidIOStruct,
            `Invalid varying struct: "${returnType.type}".`,
            returnType.location,
            ir.source
          );
        }
      } else if (returnType.type !== Keyword.VOID) {
        this._error(
          errors,
          DiagnosticType.InvalidEntryReturnType,
          "vertex main entry can only return struct or void.",
          returnType.location,
          ir.source
        );
      }

      const attribute = proto.parameterList?.[0];
      if (attribute && typeof attribute.typeInfo.type === "string") {
        if (!attribute.typeInfo.structDeclarations.length) {
          this._error(
            errors,
            DiagnosticType.InvalidIOStruct,
            `Invalid attribute struct: "${attribute.typeInfo.type}".`,
            attribute.astNode.location,
            ir.source
          );
        }
      }
    }
  }

  private static _validateFragment(analysis: ShaderAnalysisInfo, errors: GSError[]): void {
    const { coreInfo, ir } = analysis;
    for (const functionSymbol of coreInfo.fragmentEntry.functions) {
      const returnType = functionSymbol.astNode.protoType.returnType;
      if (typeof returnType.type === "string") {
        if (!returnType.typeSpecifier.structDeclarations.length) {
          this._error(
            errors,
            DiagnosticType.InvalidIOStruct,
            `Invalid MRT struct: ${returnType.type}`,
            returnType.location,
            ir.source
          );
        }
      } else if (returnType.type !== Keyword.VOID && returnType.type !== Keyword.VEC4) {
        this._error(
          errors,
          DiagnosticType.InvalidEntryReturnType,
          "fragment main entry can only return struct, vec4, or void.",
          returnType.location,
          ir.source
        );
      }
    }
  }

  private static _validateRoleConflicts(analysis: ShaderAnalysisInfo, errors: GSError[]): void {
    for (const conflict of analysis.coreInfo.roleConflicts) {
      this._error(
        errors,
        DiagnosticType.StructRoleConflict,
        `Cannot use the same struct as ${conflict.roles.join(" and ")}.`,
        conflict.struct.location,
        analysis.ir.source
      );
    }
  }

  private static _validateStructMembers(analysis: ShaderAnalysisInfo, errors: GSError[]): void {
    const { io } = analysis.coreInfo;
    const inspect = (structs: readonly StructSymbol["astNode"][], role: ShaderStructRole): void => {
      for (const struct of structs) {
        for (const prop of struct.propList) {
          if (typeof prop.typeInfo.type === "string") {
            this._error(
              errors,
              DiagnosticType.NestedIOStruct,
              `IO struct member '${prop.ident.lexeme}' cannot be a struct ('${prop.typeInfo.type}'); nested IO structs are not allowed.`,
              prop.ident.location,
              analysis.ir.source
            );
          } else if (
            role === ShaderStructRole.Varying &&
            !prop.isFlat &&
            TypeSystem.isIntegerType(prop.typeInfo.type)
          ) {
            this._error(
              errors,
              DiagnosticType.NonFlatIntegerVarying,
              `Integer varying '${prop.ident.lexeme}' must be declared 'flat'.`,
              prop.ident.location,
              analysis.ir.source
            );
          }
        }
      }
    };
    inspect(io.attributeStructs, ShaderStructRole.Attribute);
    inspect(io.varyingStructs, ShaderStructRole.Varying);
    inspect(io.mrtStructs, ShaderStructRole.Mrt);
  }

  private static _validateMrtOutputs(analysis: ShaderAnalysisInfo, errors: GSError[]): void {
    for (const issue of analysis.coreInfo.mrtOutputIssues) {
      const prop = issue.prop;
      let message: string;
      switch (issue.kind) {
        case "missing-location":
          message = `MRT output '${prop.ident.lexeme}' requires layout(location = N).`;
          break;
        case "invalid-location":
          message = `MRT output '${prop.ident.lexeme}' requires a non-negative integer location.`;
          break;
        case "duplicate-location":
          message = `MRT output location ${prop.mrtIndex} is already used by another member.`;
          break;
        default:
          message = `MRT output '${prop.ident.lexeme}' must have type vec4 for GLES portability.`;
          break;
      }
      this._error(errors, DiagnosticType.InvalidMrtOutput, message, prop.ident.location, analysis.ir.source);
    }
  }

  private static _entryNotFound(
    errors: GSError[],
    entry: string,
    location: ShaderRange | ShaderPosition | undefined,
    source: string
  ): void {
    this._error(
      errors,
      DiagnosticType.EntryNotFound,
      `Entry function '${entry}' not found.`,
      location ?? zeroPosition,
      source
    );
  }

  private static _ambiguousEntry(
    errors: GSError[],
    entry: string,
    bindingLocation: ShaderRange | ShaderPosition | undefined,
    entrySource: string | undefined,
    declarationLocation: ShaderRange,
    passSource: string
  ): void {
    this._error(
      errors,
      DiagnosticType.AmbiguousEntryPoint,
      `Entry function '${entry}' resolves to multiple declarations in the same macro configuration.`,
      bindingLocation ?? declarationLocation,
      bindingLocation && entrySource ? entrySource : passSource
    );
  }

  private static _error(
    errors: GSError[],
    code: DiagnosticType,
    message: string,
    location: ShaderRange | ShaderPosition,
    source: string
  ): void {
    errors.push(ShaderCompilerUtils.createGSError(message, GSErrorName.CompilationError, source, location, code));
  }
}
