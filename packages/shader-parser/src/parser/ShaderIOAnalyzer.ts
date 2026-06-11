import { ASTNode } from "./AST";
import { ESymbolType, FnSymbol, StructSymbol, SymbolInfo, SymbolTable } from "./symbolTable";
import { StructProp } from "./types";
import { GSError, GSErrorName } from "../GSError";
import { DiagnosticType } from "../DiagnosticType";
import { ShaderCompilerUtils } from "../ShaderCompilerUtils";
import { Keyword } from "../common/enums/Keyword";
import type { ShaderPosition, ShaderRange } from "../common";

/** Role of a struct type in the shader IO flattening — a parser-produced clue consumed by codegen and analyzer. */
export type StructRole = "varying" | "attribute" | "mrt";

/**
 * IO semantic clue computed by the parser from the entry signatures. Both codegen
 * (to emit `in`/`out`) and analyzer (to diagnose) read this — neither re-derives roles.
 */
export interface ShaderIOInfo {
  attributeStructs: ASTNode.StructSpecifier[];
  attributeList: StructProp[];
  varyingStructs: ASTNode.StructSpecifier[];
  varyingList: StructProp[];
  mrtStructs: ASTNode.StructSpecifier[];
  mrtList: StructProp[];
  /** Variable names whose type carries an IO role (entry params, locals, module globals). */
  structVarMap: Record<string, StructRole>;
}

/**
 * Derives the IO roles from a pass's vertex/fragment entry signatures and checks
 * the role-level constraints (C0-13..C0-17 existence, C0-19..C0-21 conflict).
 * Pure analysis over symbol table + AST — no code emission.
 */
export class ShaderIOAnalyzer {
  private static _lookup = new SymbolInfo("", null);

  static analyze(
    symbolTable: SymbolTable<SymbolInfo>,
    vertexEntry: string,
    fragmentEntry: string,
    source: string
  ): { io: ShaderIOInfo; errors: GSError[] } {
    const io: ShaderIOInfo = {
      attributeStructs: [],
      attributeList: [],
      varyingStructs: [],
      varyingList: [],
      mrtStructs: [],
      mrtList: [],
      structVarMap: Object.create(null)
    };
    const errors: GSError[] = [];

    this._analyzeVertex(symbolTable, vertexEntry, io, errors, source);
    this._analyzeFragment(symbolTable, fragmentEntry, io, errors, source);
    this._checkRoleConflicts(io, errors, source);

    return { io, errors };
  }

  private static _entryFns(symbolTable: SymbolTable<SymbolInfo>, entry: string): FnSymbol[] {
    const lookup = this._lookup;
    lookup.set(entry, ESymbolType.FN);
    return <FnSymbol[]>symbolTable.getSymbols(lookup, true, []);
  }

  private static _structSymbols(symbolTable: SymbolTable<SymbolInfo>, name: string): StructSymbol[] {
    const lookup = this._lookup;
    lookup.set(name, ESymbolType.STRUCT);
    return <StructSymbol[]>symbolTable.getSymbols(lookup, true, []);
  }

  private static _pushStruct(symbols: StructSymbol[], structs: ASTNode.StructSpecifier[], list: StructProp[]): void {
    for (let i = 0; i < symbols.length; i++) {
      const astNode = symbols[i].astNode;
      structs.push(astNode);
      for (const prop of astNode.propList) list.push(prop);
    }
  }

  private static _error(
    errors: GSError[],
    code: DiagnosticType,
    message: string,
    loc: ShaderRange | ShaderPosition,
    source: string
  ): void {
    errors.push(<GSError>ShaderCompilerUtils.createGSError(message, GSErrorName.CompilationError, source, loc, code));
  }

  private static _analyzeVertex(
    symbolTable: SymbolTable<SymbolInfo>,
    entry: string,
    io: ShaderIOInfo,
    errors: GSError[],
    source: string
  ): void {
    for (const fnSymbol of this._entryFns(symbolTable, entry)) {
      const proto = fnSymbol.astNode.protoType;
      const returnType = proto.returnType;

      if (typeof returnType.type === "string") {
        const varyings = this._structSymbols(symbolTable, returnType.type);
        if (!varyings.length) {
          this._error(
            errors,
            DiagnosticType.InvalidVaryingStruct,
            `invalid varying struct: "${returnType.type}".`,
            returnType.location,
            source
          );
        } else {
          this._pushStruct(varyings, io.varyingStructs, io.varyingList);
        }
      } else if (returnType.type !== Keyword.VOID) {
        this._error(
          errors,
          DiagnosticType.VertexEntryReturnType,
          "vertex main entry can only return struct or void.",
          returnType.location,
          source
        );
      }

      const attributeParam = proto.parameterList?.[0];
      if (attributeParam) {
        const attributeType = attributeParam.typeInfo.type;
        if (typeof attributeType === "string") {
          const attributes = this._structSymbols(symbolTable, attributeType);
          if (!attributes.length) {
            this._error(
              errors,
              DiagnosticType.InvalidAttributeStruct,
              `invalid attribute struct: "${attributeType}".`,
              attributeParam.astNode.location,
              source
            );
          } else {
            this._pushStruct(attributes, io.attributeStructs, io.attributeList);
          }
        }
      }
    }
  }

  private static _analyzeFragment(
    symbolTable: SymbolTable<SymbolInfo>,
    entry: string,
    io: ShaderIOInfo,
    errors: GSError[],
    source: string
  ): void {
    for (const fnSymbol of this._entryFns(symbolTable, entry)) {
      const { type: returnDataType, location: returnLocation } = fnSymbol.astNode.protoType.returnType;
      if (typeof returnDataType === "string") {
        const mrts = this._structSymbols(symbolTable, returnDataType);
        if (!mrts.length) {
          this._error(
            errors,
            DiagnosticType.InvalidMrtStruct,
            `invalid mrt struct: ${returnDataType}`,
            returnLocation,
            source
          );
        } else {
          this._pushStruct(mrts, io.mrtStructs, io.mrtList);
        }
      } else if (returnDataType !== Keyword.VOID && returnDataType !== Keyword.VEC4) {
        this._error(
          errors,
          DiagnosticType.FragmentEntryReturnType,
          "fragment main entry can only return struct or vec4.",
          returnLocation,
          source
        );
      }
    }
  }

  private static _checkRoleConflicts(io: ShaderIOInfo, errors: GSError[], source: string): void {
    for (const node of io.varyingStructs) {
      if (io.attributeStructs.indexOf(node) !== -1) {
        this._error(
          errors,
          DiagnosticType.StructRoleConflict,
          "cannot use same struct as Varying and Attribute",
          node.location,
          source
        );
      }
      if (io.mrtStructs.indexOf(node) !== -1) {
        this._error(
          errors,
          DiagnosticType.StructRoleConflict,
          "cannot use same struct as Varying and MRT",
          node.location,
          source
        );
      }
    }
    for (const node of io.attributeStructs) {
      if (io.mrtStructs.indexOf(node) !== -1) {
        this._error(
          errors,
          DiagnosticType.StructRoleConflict,
          "cannot use same struct as Attribute and MRT",
          node.location,
          source
        );
      }
    }
  }
}
