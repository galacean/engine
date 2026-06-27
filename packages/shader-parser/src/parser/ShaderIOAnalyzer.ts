import { ASTNode, TreeNode } from "./AST";
import { ShaderData } from "./ShaderInfo";
import { ESymbolType, FnSymbol, StructSymbol, SymbolInfo, SymbolTable } from "./symbolTable";
import { StructProp } from "./types";
import { BaseToken } from "../common/BaseToken";
import { GSError, GSErrorName } from "../GSError";
import { DiagnosticType } from "../DiagnosticType";
import { ShaderCompilerUtils } from "../ShaderCompilerUtils";
import { TypeSystem } from "./TypeSystem";
import { Keyword } from "../common/enums/Keyword";
import type { ShaderPosition, ShaderRange } from "../common";

/** Role of a struct type in the shader IO flattening — a parser-derived clue codegen consumes to emit `in`/`out`. */
export enum StructRole {
  Varying = "varying",
  Attribute = "attribute",
  Mrt = "mrt"
}

/**
 * IO structs and per-variable roles derived by the parser from the entry signatures,
 * consumed by both codegen (to emit `in`/`out`, rewrite `#define`) and the analyzer (to
 * diagnose) — neither re-derives them.
 */
export interface ShaderIOInfo {
  attributeStructs: ASTNode.StructSpecifier[];
  attributeList: StructProp[];
  varyingStructs: ASTNode.StructSpecifier[];
  varyingList: StructProp[];
  mrtStructs: ASTNode.StructSpecifier[];
  mrtList: StructProp[];
  /** Variable names (entry params, locals, module globals) whose type carries an IO role. */
  structVarMap: Record<string, StructRole>;
}

/**
 * Derives the IO roles from a pass's vertex/fragment entry signatures and checks the
 * pipeline constraints: struct existence, entry return shape, role conflicts, and
 * gl_FragColor-with-MRT (from a parse-time clue). Pure analysis — no code emission.
 */
export class ShaderIOAnalyzer {
  private static _lookup = new SymbolInfo("", null);

  static analyze(
    shaderData: ShaderData,
    vertexEntry: string,
    fragmentEntry: string,
    source: string,
    vertexEntryLocation?: ShaderRange | ShaderPosition,
    fragmentEntryLocation?: ShaderRange | ShaderPosition
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
    const symbolTable = shaderData.symbolTable;

    // A bound entry name that resolves to no function is a typo (e.g. `VertexShader = vrt`). Empty entry
    // strings are MissingEntry's job, handled at parse time — only a non-empty miss is flagged here.
    if (vertexEntry && !this._entryFns(symbolTable, vertexEntry).length) {
      this._reportEntryNotFound(errors, vertexEntry, vertexEntryLocation, source);
    }
    if (fragmentEntry && !this._entryFns(symbolTable, fragmentEntry).length) {
      this._reportEntryNotFound(errors, fragmentEntry, fragmentEntryLocation, source);
    }

    this._analyzeVertex(symbolTable, vertexEntry, io, errors, source);
    this._analyzeFragment(symbolTable, fragmentEntry, io, errors, source);
    this._checkRoleConflicts(io, errors, source);
    this._deriveStructVarMap(symbolTable, vertexEntry, fragmentEntry, io.structVarMap);

    // MRT and gl_FragColor are mutually exclusive fragment outputs (clue collected at parse time).
    if (io.mrtStructs.length) {
      const refs = shaderData.glFragColorReferences;
      for (let i = 0; i < refs.length; i++) {
        this._error(
          errors,
          DiagnosticType.GlFragColorWithMrt,
          "gl_FragColor cannot be used with MRT (Multiple Render Targets).",
          refs[i],
          source
        );
      }
    }

    // A vertex entry must write gl_Position. The reference clue is global, so a single write anywhere
    // clears it (no false positive); only a complete absence with a present vertex entry is flagged.
    if (shaderData.glPositionReferences.length === 0) {
      const vertFns = this._entryFns(symbolTable, vertexEntry);
      if (vertFns.length) {
        this._error(
          errors,
          DiagnosticType.MissingVertexPosition,
          "Vertex shader must write gl_Position.",
          vertFns[0].astNode.protoType.returnType.location,
          source
        );
      }
    }

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

  private static _pushStruct(
    symbols: StructSymbol[],
    structs: ASTNode.StructSpecifier[],
    list: StructProp[],
    errors: GSError[],
    source: string,
    role: StructRole
  ): void {
    for (let i = 0; i < symbols.length; i++) {
      const astNode = symbols[i].astNode;
      structs.push(astNode);
      for (const prop of astNode.propList) {
        list.push(prop);
        // GLSL ES forbids nested IO structs; a struct-typed member's type is a name string (primitives are Keyword numbers).
        if (typeof prop.typeInfo.type === "string") {
          this._error(
            errors,
            DiagnosticType.NestedIOStruct,
            `IO struct member '${prop.ident.lexeme}' cannot be a struct ('${prop.typeInfo.type}'); nested IO structs are not allowed.`,
            prop.ident.location,
            source
          );
        } else if (role === StructRole.Varying && !prop.isFlat && TypeSystem.isIntegerType(prop.typeInfo.type)) {
          // An integer varying has no default interpolation — GLSL ES requires `flat`.
          this._error(
            errors,
            DiagnosticType.NonFlatIntegerVarying,
            `Integer varying '${prop.ident.lexeme}' must be declared 'flat'.`,
            prop.ident.location,
            source
          );
        }
      }
    }
  }

  private static _error(
    errors: GSError[],
    code: DiagnosticType,
    message: string,
    loc: ShaderRange | ShaderPosition,
    source: string
  ): void {
    errors.push(ShaderCompilerUtils.createGSError(message, GSErrorName.CompilationError, source, loc, code));
  }

  private static _reportEntryNotFound(
    errors: GSError[],
    entry: string,
    loc: ShaderRange | ShaderPosition | undefined,
    source: string
  ): void {
    // Codegen callers don't plumb the entry location; fall back to a 0-position so the diagnostic still fires.
    this._error(
      errors,
      DiagnosticType.EntryNotFound,
      `Entry function '${entry}' not found.`,
      loc ?? <ShaderPosition>{ index: 0, line: 0, column: 0 },
      source
    );
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
            DiagnosticType.InvalidIOStruct,
            `Invalid varying struct: "${returnType.type}".`,
            returnType.location,
            source
          );
        } else {
          this._pushStruct(varyings, io.varyingStructs, io.varyingList, errors, source, StructRole.Varying);
        }
      } else if (returnType.type !== Keyword.VOID) {
        this._error(
          errors,
          DiagnosticType.InvalidEntryReturnType,
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
              DiagnosticType.InvalidIOStruct,
              `Invalid attribute struct: "${attributeType}".`,
              attributeParam.astNode.location,
              source
            );
          } else {
            this._pushStruct(attributes, io.attributeStructs, io.attributeList, errors, source, StructRole.Attribute);
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
            DiagnosticType.InvalidIOStruct,
            `Invalid MRT struct: ${returnDataType}`,
            returnLocation,
            source
          );
        } else {
          this._pushStruct(mrts, io.mrtStructs, io.mrtList, errors, source, StructRole.Mrt);
        }
      } else if (returnDataType !== Keyword.VOID && returnDataType !== Keyword.VEC4) {
        this._error(
          errors,
          DiagnosticType.InvalidEntryReturnType,
          "fragment main entry can only return struct, vec4, or void.",
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

  /**
   * Map variable names (entry params, locals, module globals) to their IO role. Roles come from
   * the entry signatures; a body walk picks up locals like `Varyings o;`. Codegen reads this to
   * rewrite struct-prop references consistently across vertex/fragment `#define` expansions.
   */
  private static _deriveStructVarMap(
    symbolTable: SymbolTable<SymbolInfo>,
    vertexEntry: string,
    fragmentEntry: string,
    structVarMap: Record<string, StructRole>
  ): void {
    // Roles from entry signatures: vertex param[0]=attribute, return=varying; fragment param[0]=varying, return=mrt.
    const structRoles: Record<string, StructRole> = Object.create(null);

    const addEntryRoles = (entry: string, paramRole: StructRole, returnRole: StructRole): FnSymbol[] => {
      const fns = this._entryFns(symbolTable, entry);
      for (const fn of fns) {
        const proto = fn.astNode.protoType;
        const param0 = proto.parameterList?.[0];
        if (param0 && typeof param0.typeInfo?.type === "string") {
          structRoles[param0.typeInfo.typeLexeme] = paramRole;
        }
        if (typeof proto.returnType.type === "string") {
          structRoles[<string>proto.returnType.type] = returnRole;
        }
      }
      return fns;
    };

    const entryFns = addEntryRoles(vertexEntry, StructRole.Attribute, StructRole.Varying).concat(
      addEntryRoles(fragmentEntry, StructRole.Varying, StructRole.Mrt)
    );

    const registerByType = (typeLexeme: string | undefined, varName: string): void => {
      if (!typeLexeme) return;
      const role = structRoles[typeLexeme];
      if (role) structVarMap[varName] = role;
    };

    const extractLocalVarNames = (node: ASTNode.InitDeclaratorList, role: StructRole): void => {
      const children = node.children;
      if (children.length === 1) {
        const identChildren = (children[0] as ASTNode.SingleDeclaration).children;
        if (identChildren.length >= 2 && identChildren[1] instanceof BaseToken) {
          structVarMap[identChildren[1].lexeme] = role;
        }
      } else if (children.length >= 3) {
        const initDeclList = children[0];
        if (initDeclList instanceof ASTNode.InitDeclaratorList) extractLocalVarNames(initDeclList, role);
        if (children[2] instanceof BaseToken) structVarMap[(children[2] as BaseToken).lexeme] = role;
      }
    };

    const walkLocals = (node: TreeNode): void => {
      for (const child of node.children) {
        if (child instanceof ASTNode.InitDeclaratorList) {
          const typeLexeme = child.typeInfo?.typeLexeme;
          if (typeLexeme && structRoles[typeLexeme]) extractLocalVarNames(child, structRoles[typeLexeme]);
        } else if (child instanceof TreeNode) {
          walkLocals(child);
        }
      }
    };

    for (const fn of entryFns) {
      const proto = fn.astNode.protoType;
      if (proto.parameterList) {
        for (const param of proto.parameterList) {
          if (param.ident && typeof param.typeInfo?.type === "string") {
            registerByType(param.typeInfo.typeLexeme, param.ident.lexeme);
          }
        }
      }
      walkLocals(fn.astNode.statements);
    }

    // Register module-level globals whose type carries a role (e.g. `Varyings o;`).
    symbolTable.forEach((sym) => {
      if (sym.type === ESymbolType.VAR) registerByType(sym.dataType?.typeLexeme, sym.ident);
    });
  }
}
