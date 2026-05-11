import type { IShaderInfo } from "@galacean/engine-design";
import { BaseToken } from "../common/BaseToken";
import { EShaderStage } from "../common/enums/ShaderStage";
import { Keyword } from "../common/enums/Keyword";
import { ASTNode, TreeNode } from "../parser/AST";
import { NodeChild } from "../parser/types";
import { ShaderData } from "../parser/ShaderInfo";
import { ESymbolType, FnSymbol, StructSymbol, SymbolInfo } from "../parser/symbolTable";
import { CodeGenVisitor } from "./CodeGenVisitor";
import { ICodeSegment } from "./types";
import { StructRole, VisitorContext } from "./VisitorContext";

/**
 * @internal
 */
export abstract class GLESVisitor extends CodeGenVisitor {
  private _globalCodeArray: ICodeSegment[] = [];
  private static _lookupSymbol: SymbolInfo = new SymbolInfo("", null);
  private static _serializedGlobalKey = new Set();

  reset(): void {
    const { _globalCodeArray: globalCodeArray } = this;
    globalCodeArray.length = 0;
    GLESVisitor._serializedGlobalKey.clear();
  }

  getOtherGlobal(data: ShaderData, out: ICodeSegment[]): void {
    for (const precision of data.globalPrecisions) {
      out.push({ text: precision.codeGen(this), index: precision.location.start.index });
    }
  }

  visitShaderProgram(node: ASTNode.GLShaderProgram, vertexEntry: string, fragmentEntry: string): IShaderInfo {
    // #if _VERBOSE
    this.errors.length = 0;
    // #endif
    VisitorContext.reset();
    this.reset();

    const shaderData = node.shaderData;
    const context = VisitorContext.context;
    context._passSymbolTable = shaderData.symbolTable;

    const outerGlobalMacroDeclarations = shaderData.getOuterGlobalMacroDeclarations();

    // `_structVarMap` must span both stages so global `#define` references rewrite consistently across vertex/fragment outputs.
    this._collectAllStructVars(vertexEntry, fragmentEntry);

    return {
      vertex: this._vertexMain(vertexEntry, shaderData, outerGlobalMacroDeclarations),
      fragment: this._fragmentMain(fragmentEntry, shaderData, outerGlobalMacroDeclarations)
    };
  }

  /** Populate `_structVarMap` for varying/attribute/mrt-typed variables across both stages before codegen. */
  private _collectAllStructVars(vertexEntry: string, fragmentEntry: string): void {
    const context = VisitorContext.context;
    const lookupSymbol = GLESVisitor._lookupSymbol;
    const symbolTable = context._passSymbolTable;

    // Roles from entry signatures: vertex param[0]=attribute, return=varying; fragment param[0]=varying, return=mrt.
    const structRoles: Record<string, StructRole> = Object.create(null);

    const addEntryRoles = (entry: string, paramRole: StructRole, returnRole: StructRole): FnSymbol[] => {
      lookupSymbol.set(entry, ESymbolType.FN);
      const fns = <FnSymbol[]>symbolTable.getSymbols(lookupSymbol, true, []);
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

    const entryFns = addEntryRoles(vertexEntry, "attribute", "varying").concat(
      addEntryRoles(fragmentEntry, "varying", "mrt")
    );

    const registerByType = (typeLexeme: string | undefined, varName: string): void => {
      if (!typeLexeme) return;
      const role = structRoles[typeLexeme];
      if (role) context.registerStructVar(varName, role);
    };

    const walkLocals = (node: TreeNode): void => {
      for (const child of node.children) {
        if (child instanceof ASTNode.InitDeclaratorList) {
          const typeLexeme = child.typeInfo?.typeLexeme;
          if (typeLexeme && structRoles[typeLexeme]) {
            this._extractLocalVarNames(child, context, structRoles[typeLexeme]);
          }
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

  private _vertexMain(
    entry: string,
    data: ShaderData,
    outerGlobalMacroDeclarations: ASTNode.GlobalDeclaration[]
  ): string {
    const context = VisitorContext.context;
    context.stage = EShaderStage.VERTEX;
    context.stageEntry = entry;

    const lookupSymbol = GLESVisitor._lookupSymbol;
    const symbolTable = data.symbolTable;
    lookupSymbol.set(entry, ESymbolType.FN);
    const fnSymbols = <FnSymbol[]>symbolTable.getSymbols(lookupSymbol, true, []);
    if (!fnSymbols.length) throw `no entry function found: ${entry}`;

    const { attributeStructs, attributeList, varyingStructs, varyingList } = context;
    fnSymbols.forEach((fnSymbol) => {
      const fnNode = fnSymbol.astNode;
      const returnType = fnNode.protoType.returnType;

      if (typeof returnType.type === "string") {
        lookupSymbol.set(returnType.type, ESymbolType.STRUCT);
        const varyingSymbols = <StructSymbol[]>symbolTable.getSymbols(lookupSymbol, true, []);
        if (!varyingSymbols.length) {
          this._reportError(returnType.location, `invalid varying struct: "${returnType.type}".`);
        } else {
          for (let i = 0; i < varyingSymbols.length; i++) {
            const varyingSymbol = varyingSymbols[i];
            const astNode = varyingSymbol.astNode;
            varyingStructs.push(astNode);
            for (const prop of astNode.propList) {
              varyingList.push(prop);
            }
          }
        }
      } else if (returnType.type !== Keyword.VOID) {
        this._reportError(returnType.location, "vertex main entry can only return struct or void.");
      }

      const paramList = fnNode.protoType.parameterList;
      const attributeParam = paramList?.[0];
      if (attributeParam) {
        const attributeType = attributeParam.typeInfo.type;
        if (typeof attributeType === "string") {
          lookupSymbol.set(attributeType, ESymbolType.STRUCT);
          const attributeSymbols = <StructSymbol[]>symbolTable.getSymbols(lookupSymbol, true, []);
          if (!attributeSymbols.length) {
            this._reportError(attributeParam.astNode.location, `invalid attribute struct: "${attributeType}".`);
          } else {
            for (let i = 0; i < attributeSymbols.length; i++) {
              const attributeSymbol = attributeSymbols[i];
              const astNode = attributeSymbol.astNode;
              attributeStructs.push(astNode);
              for (const prop of astNode.propList) {
                attributeList.push(prop);
              }
            }
          }
        }
      }
    });

    // Pre-walk global `#define` values so referenced struct properties emit `attribute`/`varying` declarations.
    this._preRegisterGlobalMacroRefs(outerGlobalMacroDeclarations);

    const globalCodeArray = this._globalCodeArray;
    VisitorContext.context.referenceGlobal(entry, ESymbolType.FN);

    this._getGlobalSymbol(globalCodeArray);
    this._getCustomStruct(context.attributeStructs, globalCodeArray);
    this._getCustomStruct(context.varyingStructs, globalCodeArray);
    this._getGlobalMacroDeclarations(outerGlobalMacroDeclarations, globalCodeArray);
    this.getOtherGlobal(data, globalCodeArray);

    const globalCode = globalCodeArray
      .sort((a, b) => a.index - b.index)
      .map((item) => item.text)
      .join("\n");

    VisitorContext.context.reset(false);
    this.reset();

    return globalCode;
  }

  private _fragmentMain(
    entry: string,
    data: ShaderData,
    outerGlobalMacroStatements: ASTNode.GlobalDeclaration[]
  ): string {
    const context = VisitorContext.context;
    context.stage = EShaderStage.FRAGMENT;
    context.stageEntry = entry;

    const lookupSymbol = GLESVisitor._lookupSymbol;
    const { symbolTable } = data;
    lookupSymbol.set(entry, ESymbolType.FN);
    const fnSymbols = <FnSymbol[]>symbolTable.getSymbols(lookupSymbol, true, []);
    if (!fnSymbols?.length) throw `no entry function found: ${entry}`;

    // Fragment varying info inherits from vertex stage (preserved across `context.reset(false)`).
    fnSymbols.forEach((fnSymbol) => {
      const fnNode = fnSymbol.astNode;
      const { returnStatement } = fnNode;

      if (returnStatement) {
        returnStatement.isFragReturnStatement = true;
      }

      const { type: returnDataType, location: returnLocation } = fnNode.protoType.returnType;
      if (typeof returnDataType === "string") {
        lookupSymbol.set(returnDataType, ESymbolType.STRUCT);
        const mrtSymbols = <StructSymbol[]>symbolTable.getSymbols(lookupSymbol, true, []);
        if (!mrtSymbols.length) {
          this._reportError(returnLocation, `invalid mrt struct: ${returnDataType}`);
        } else {
          for (let i = 0; i < mrtSymbols.length; i++) {
            const mrtSymbol = mrtSymbols[i];
            const astNode = mrtSymbol.astNode;
            context.mrtStructs.push(astNode);
            for (const prop of astNode.propList) {
              context.mrtList.push(prop);
            }
          }
        }
      } else if (returnDataType !== Keyword.VOID && returnDataType !== Keyword.VEC4) {
        this._reportError(returnLocation, "fragment main entry can only return struct or vec4.");
      }
    });

    // `_structVarMap` is already populated in `visitShaderProgram` with both stages'
    // variables; just pre-walk macro refs so struct codegen sees the references.
    this._preRegisterGlobalMacroRefs(outerGlobalMacroStatements);

    const globalCodeArray = this._globalCodeArray;
    VisitorContext.context.referenceGlobal(entry, ESymbolType.FN);

    this._getGlobalSymbol(globalCodeArray);
    this._getCustomStruct(context.varyingStructs, globalCodeArray);
    this._getCustomStruct(context.mrtStructs, globalCodeArray);
    this._getGlobalMacroDeclarations(outerGlobalMacroStatements, globalCodeArray);
    this.getOtherGlobal(data, globalCodeArray);

    const globalCode = globalCodeArray
      .sort((a, b) => a.index - b.index)
      .map((item) => item.text)
      .join("\n");

    context.reset();
    this.reset();

    return globalCode;
  }

  private _extractLocalVarNames(node: ASTNode.InitDeclaratorList, context: VisitorContext, role: StructRole): void {
    const children = node.children;
    if (children.length === 1) {
      const singleDecl = children[0] as ASTNode.SingleDeclaration;
      const identChildren = singleDecl.children;
      if (identChildren.length >= 2 && identChildren[1] instanceof BaseToken) {
        context.registerStructVar(identChildren[1].lexeme, role);
      }
    } else if (children.length >= 3) {
      const initDeclList = children[0];
      if (initDeclList instanceof ASTNode.InitDeclaratorList) {
        this._extractLocalVarNames(initDeclList, context, role);
      }
      if (children[2] instanceof BaseToken) {
        context.registerStructVar((children[2] as BaseToken).lexeme, role);
      }
    }
  }

  /**
   * Pre-walk `#define` values in global macro declarations and register any
   * `structVar.prop` member accesses as referenced struct props. This must run before
   * struct codegen emits the declaration lists (`attribute …`, `varying …`, `MRT …`),
   * otherwise properties used only from macros would be missing from the output.
   */
  private _preRegisterGlobalMacroRefs(macros: ASTNode.GlobalDeclaration[]): void {
    for (const macro of macros) {
      this._walkMacroDefineTokens(macro.children);
    }
  }

  private _walkMacroDefineTokens(children: NodeChild[]): void {
    for (const child of children) {
      if (child instanceof ASTNode.MacroDefine) {
        // Codegen the value once so the enclosed `visitPostfixExpression` calls
        // register their struct-prop references. The returned string is discarded
        // — the real emit happens later in `_getGlobalMacroDeclarations`.
        if (child.valueExpression) child.valueExpression.codeGen(this);
      } else if (child instanceof TreeNode) {
        this._walkMacroDefineTokens(child.children);
      }
    }
  }

  private _getGlobalSymbol(out: ICodeSegment[]): void {
    const context = VisitorContext.context;
    const { _referencedGlobals } = context;
    const lastLength = Object.keys(_referencedGlobals).length;
    if (lastLength === 0) return;

    for (const ident in _referencedGlobals) {
      if (GLESVisitor._serializedGlobalKey.has(ident)) continue;
      GLESVisitor._serializedGlobalKey.add(ident);

      const symbols = _referencedGlobals[ident];
      for (let i = 0, n = symbols.length; i < n; i++) {
        const sm = symbols[i];
        const codeGenResult = sm.astNode.codeGen(this);
        if (!codeGenResult) continue;
        const text = codeGenResult + (sm.type === ESymbolType.VAR ? ";" : "");
        if (!sm.isInMacroBranch) {
          out.push({
            text,
            index: sm.astNode.location.start.index
          });
        }
      }
    }

    if (Object.keys(_referencedGlobals).length !== lastLength) {
      this._getGlobalSymbol(out);
    }
  }

  private _getCustomStruct(structNodes: ASTNode.StructSpecifier[], out: ICodeSegment[]): void {
    for (const node of structNodes) {
      const text = node.codeGen(this);

      if (!node.isInMacroBranch) {
        out.push({ text, index: node.location.start.index });
      }
    }
  }

  private _getGlobalMacroDeclarations(macros: ASTNode.GlobalDeclaration[], out: ICodeSegment[]): void {
    const context = VisitorContext.context;
    const referencedGlobals = context._referencedGlobals;
    const referencedGlobalMacroASTs = context._referencedGlobalMacroASTs;
    referencedGlobalMacroASTs.length = 0;

    for (const symbols of Object.values(referencedGlobals)) {
      for (const symbol of symbols) {
        if (symbol.isInMacroBranch) {
          referencedGlobalMacroASTs.push(symbol.astNode);
        }
      }
    }

    for (const macro of macros) {
      let text: string;
      const child = macro.children[0];

      if (child instanceof ASTNode.GlobalMacroIfStatement) {
        let result: ICodeSegment[] = [];
        result.push(
          ...macro.macroExpressions.map((item) => ({
            text: item instanceof BaseToken ? item.lexeme : item.codeGen(this),
            index: item.location.start.index
          }))
        );

        this._visitGlobalMacroIfStatement(child, result);

        text = result
          .sort((a, b) => a.index - b.index)
          .map((item) => item.text)
          .join("\n");
      } else if (child instanceof BaseToken && child.type === Keyword.MACRO_DEFINE_EXPRESSION) {
        // Legacy opaque `#define` — its lexeme is the complete directive text,
        // newlines included; emit verbatim.
        text = child.lexeme;
      } else {
        text = macro.codeGen(this);
      }

      out.push({
        text,
        index: macro.location.start.index
      });
    }
  }

  private _visitGlobalMacroIfStatement(node: TreeNode, out: ICodeSegment[]): void {
    const children = node.children;
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (child instanceof ASTNode.PrecisionSpecifier) {
        out.push({
          text: child.codeGen(this),
          index: child.location.start.index
        });
      } else if (child instanceof ASTNode.FunctionDefinition) {
        if (VisitorContext.context._referencedGlobalMacroASTs.indexOf(child) !== -1) {
          out.push({
            text: child.getCache(), // code has generated in `_getGlobalSymbol`
            index: child.location.start.index
          });
        }
      } else if (child instanceof ASTNode.StructSpecifier) {
        const context = VisitorContext.context;
        const stage = context.stage;
        if (
          VisitorContext.context._referencedGlobalMacroASTs.indexOf(child) !== -1 ||
          (stage === EShaderStage.VERTEX
            ? context.isAttributeStruct(child.ident?.lexeme) || context.isVaryingStruct(child.ident?.lexeme)
            : context.isVaryingStruct(child.ident?.lexeme) || context.isMRTStruct(child.ident?.lexeme))
        ) {
          out.push({
            text: child.getCache(), // code has generated in `_getGlobalSymbol` or `_getCustomStruct`
            index: child.location.start.index
          });
        }
      } else if (child instanceof ASTNode.VariableDeclarationList) {
        const variableDeclarations = child.variableDeclarations;
        for (let i = 0; i < variableDeclarations.length; i++) {
          const variableDeclaration = variableDeclarations[i];
          if (VisitorContext.context._referencedGlobalMacroASTs.indexOf(variableDeclaration) !== -1) {
            out.push({
              text: variableDeclaration.getCache() + ";", // code has generated in `_getGlobalSymbol`
              index: variableDeclaration.location.start.index
            });
          }
        }
      }

      if (child instanceof TreeNode) {
        this._visitGlobalMacroIfStatement(child, out);
      }
    }
  }
}
