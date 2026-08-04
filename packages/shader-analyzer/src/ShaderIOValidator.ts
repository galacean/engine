import {
  GSError,
  GSErrorName,
  Keyword,
  ShaderCompilerUtils,
  ShaderStructRole,
  StructSymbol,
  SymbolInfo,
  TypeSystem,
  ESymbolType,
  type ShaderPosition,
  type ShaderRange
} from "@galacean/engine-shader-parser/verbose";
import type { ShaderAnalysisInfo } from "./ShaderAnalysisInfo";
import { DiagnosticType } from "./DiagnosticType";

/**
 * Validates pipeline IO facts produced by `ShaderCoreInfo`.
 * @internal
 */
export class ShaderIOValidator {
  private static readonly _lookup = new SymbolInfo("", null);

  /**
   * Validates stage entries and IO without participating in backend generation.
   * @param analysis - Analyzer-only facts and their neutral/core backing data.
   * @param vertexEntryLocation - ShaderLab source range of the vertex entry binding.
   * @param fragmentEntryLocation - ShaderLab source range of the fragment entry binding.
   * @returns Analyzer errors for invalid pipeline IO.
   */
  static validate(
    analysis: ShaderAnalysisInfo,
    vertexEntryLocation?: ShaderRange | ShaderPosition,
    fragmentEntryLocation?: ShaderRange | ShaderPosition
  ): GSError[] {
    const { ir, coreInfo } = analysis;
    const source = ir.source;
    const errors: GSError[] = [];

    if (coreInfo.vertexEntry.name && !coreInfo.vertexEntry.functions.length) {
      this._entryNotFound(errors, coreInfo.vertexEntry.name, vertexEntryLocation, source);
    }
    if (coreInfo.fragmentEntry.name && !coreInfo.fragmentEntry.functions.length) {
      this._entryNotFound(errors, coreInfo.fragmentEntry.name, fragmentEntryLocation, source);
    }

    this._validateVertex(analysis, errors);
    this._validateFragment(analysis, errors);
    this._validateRoleConflicts(analysis, errors);
    this._validateStructMembers(analysis, errors);

    if (coreInfo.io.mrtStructs.length && analysis.glFragColorReferences.length) {
      this._error(
        errors,
        DiagnosticType.GlFragColorWithMrt,
        "gl_FragColor cannot be used with MRT (Multiple Render Targets).",
        analysis.glFragColorReferences[0],
        source
      );
    }

    if (coreInfo.vertexEntry.functions.length && !analysis.hasReachableWrite(coreInfo.vertexEntry, "gl_Position")) {
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
    const symbolTable = ir.shaderData.symbolTable;
    for (const functionSymbol of coreInfo.vertexEntry.functions) {
      const proto = functionSymbol.astNode.protoType;
      const returnType = proto.returnType;
      if (typeof returnType.type === "string") {
        if (!this._findStructs(symbolTable, returnType.type).length) {
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
        if (!this._findStructs(symbolTable, attribute.typeInfo.type).length) {
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
    const symbolTable = ir.shaderData.symbolTable;
    for (const functionSymbol of coreInfo.fragmentEntry.functions) {
      const returnType = functionSymbol.astNode.protoType.returnType;
      if (typeof returnType.type === "string") {
        if (!this._findStructs(symbolTable, returnType.type).length) {
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

  private static _findStructs(
    symbolTable: ShaderAnalysisInfo["ir"]["shaderData"]["symbolTable"],
    name: string
  ): StructSymbol[] {
    const lookup = this._lookup;
    lookup.set(name, ESymbolType.STRUCT);
    return <StructSymbol[]>symbolTable.getSymbols(lookup, true, []);
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
      location ?? <ShaderPosition>{ index: 0, line: 0, column: 0 },
      source
    );
  }

  private static _error(
    errors: GSError[],
    code: DiagnosticType,
    message: string,
    location: ShaderRange | ShaderPosition,
    source: string
  ): void {
    errors.push(
      ShaderCompilerUtils.createGSError(message, GSErrorName.CompilationError, source, location, code) as GSError
    );
  }
}
