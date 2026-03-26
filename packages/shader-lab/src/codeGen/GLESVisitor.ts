import { IShaderInfo } from "@galacean/engine-design";
import { BaseToken } from "../common/BaseToken";
import { EShaderStage } from "../common/enums/ShaderStage";
import { Keyword } from "../common/enums/Keyword";
import { ASTNode, TreeNode } from "../parser/AST";
import { ShaderData } from "../parser/ShaderInfo";
import { ESymbolType, FnSymbol, StructSymbol, SymbolInfo } from "../parser/symbolTable";
import { NodeChild } from "../parser/types";
import { CodeGenVisitor } from "./CodeGenVisitor";
import { ICodeSegment } from "./types";
import { VisitorContext } from "./VisitorContext";

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

    // Build combined _globalStructVarMap from both entry functions before per-stage processing.
    // This must happen here because vertex runs first and doesn't yet know fragment's variables.
    this._buildGlobalStructVarMap(vertexEntry, fragmentEntry, shaderData, context);

    return {
      vertex: this._vertexMain(vertexEntry, shaderData, outerGlobalMacroDeclarations),
      fragment: this._fragmentMain(fragmentEntry, shaderData, outerGlobalMacroDeclarations)
    };
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

    // Pre-register global #define member access references for this stage
    this._registerGlobalMacroReferences(outerGlobalMacroDeclarations, context);

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

    // Pre-register global #define member access references for this stage
    this._registerGlobalMacroReferences(outerGlobalMacroStatements, context);

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

  /**
   * Build _globalStructVarMap from both entry functions before per-stage processing.
   * Classifies struct types by their position in function signatures:
   * - vertex param[0] → attribute, vertex return type → varying
   * - fragment param[0] → varying, fragment return type → mrt
   */
  private _buildGlobalStructVarMap(
    vertexEntry: string,
    fragmentEntry: string,
    data: ShaderData,
    context: VisitorContext
  ): void {
    const map = context._globalStructVarMap;
    const lookupSymbol = GLESVisitor._lookupSymbol;
    const { symbolTable } = data;

    // Map struct type names to roles based on function signature positions
    const structTypeRoles: Record<string, "varying" | "attribute" | "mrt"> = Object.create(null);

    // Vertex entry: param[0] type → attribute, return type → varying
    lookupSymbol.set(vertexEntry, ESymbolType.FN);
    const vertexFns = <FnSymbol[]>symbolTable.getSymbols(lookupSymbol, true, []);
    for (const fn of vertexFns) {
      const proto = fn.astNode.protoType;
      const param0 = proto.parameterList?.[0];
      if (param0 && typeof param0.typeInfo.type === "string") {
        structTypeRoles[param0.typeInfo.typeLexeme] = "attribute";
      }
      if (typeof proto.returnType.type === "string") {
        structTypeRoles[<string>proto.returnType.type] = "varying";
      }
    }

    // Fragment entry: param[0] type → varying, return type → mrt
    lookupSymbol.set(fragmentEntry, ESymbolType.FN);
    const fragmentFns = <FnSymbol[]>symbolTable.getSymbols(lookupSymbol, true, []);
    for (const fn of fragmentFns) {
      const proto = fn.astNode.protoType;
      const param0 = proto.parameterList?.[0];
      if (param0 && typeof param0.typeInfo.type === "string") {
        structTypeRoles[param0.typeInfo.typeLexeme] = "varying";
      }
      if (typeof proto.returnType.type === "string") {
        structTypeRoles[<string>proto.returnType.type] = "mrt";
      }
    }

    // Scan all entry functions' params and local vars, classify by structTypeRoles
    for (const fn of [...vertexFns, ...fragmentFns]) {
      const fnNode = fn.astNode;
      const paramList = fnNode.protoType.parameterList;
      if (paramList) {
        for (const param of paramList) {
          if (param.ident && param.typeInfo && typeof param.typeInfo.type === "string") {
            const role = structTypeRoles[param.typeInfo.typeLexeme];
            if (role) map[param.ident.lexeme] = role;
          }
        }
      }
      this._collectStructVarsFromBody(fnNode.statements, structTypeRoles, map);
    }
  }

  private _collectStructVarsFromBody(
    node: TreeNode,
    structTypeRoles: Record<string, "varying" | "attribute" | "mrt">,
    map: Record<string, "varying" | "attribute" | "mrt">
  ): void {
    const children = node.children;
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (child instanceof ASTNode.InitDeclaratorList) {
        const typeLexeme = child.typeInfo?.typeLexeme;
        if (typeLexeme) {
          const role = structTypeRoles[typeLexeme];
          if (role) {
            this._extractVarNamesFromInitDeclaratorList(child, map, role);
          }
        }
      } else if (child instanceof TreeNode) {
        this._collectStructVarsFromBody(child, structTypeRoles, map);
      }
    }
  }

  /**
   * Pre-register attribute/varying/mrt references from global #define member access patterns,
   * so that declarations are emitted by _getCustomStruct for the current stage.
   */
  private _registerGlobalMacroReferences(globalMacros: ASTNode.GlobalDeclaration[], context: VisitorContext): void {
    const map = context._globalStructVarMap;
    if (!Object.keys(map).length) return;
    const reg = CodeGenVisitor._memberAccessReg;
    for (const macro of globalMacros) {
      this._scanMacroMemberAccess(macro.children, reg, map, context);
    }
  }

  private _scanMacroMemberAccess(
    children: NodeChild[],
    reg: RegExp,
    map: Record<string, "varying" | "attribute" | "mrt">,
    context: VisitorContext
  ): void {
    for (const child of children) {
      if (child instanceof BaseToken && child.type === Keyword.MACRO_DEFINE_EXPRESSION) {
        const spaceIdx = child.lexeme.indexOf(" ");
        if (spaceIdx === -1) continue;
        const value = child.lexeme.substring(spaceIdx);
        reg.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = reg.exec(value)) !== null) {
          const role = map[match[1]];
          if (role) context.referenceStructPropByName(role, match[2]);
        }
      } else if (child instanceof TreeNode) {
        this._scanMacroMemberAccess(child.children, reg, map, context);
      }
    }
  }

  private _getGlobalSymbol(out: ICodeSegment[]): void {
    const { _referencedGlobals } = VisitorContext.context;

    const lastLength = Object.keys(_referencedGlobals).length;
    if (lastLength === 0) return;

    for (const ident in _referencedGlobals) {
      if (GLESVisitor._serializedGlobalKey.has(ident)) continue;
      GLESVisitor._serializedGlobalKey.add(ident);

      const symbols = _referencedGlobals[ident];
      for (let i = 0; i < symbols.length; i++) {
        const sm = symbols[i];
        const text = sm.astNode.codeGen(this) + (sm.type === ESymbolType.VAR ? ";" : "");
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
    const globalMap = context._globalStructVarMap;
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
            text:
              item instanceof BaseToken
                ? item.type === Keyword.MACRO_DEFINE_EXPRESSION
                  ? this._transformMacroDefineValue(item.lexeme, globalMap)
                  : item.lexeme
                : item.codeGen(this),
            index: item.location.start.index
          }))
        );

        this._visitGlobalMacroIfStatement(child, result);

        text = result
          .sort((a, b) => a.index - b.index)
          .map((item) => item.text)
          .join("\n");
      } else if (child instanceof BaseToken && child.type === Keyword.MACRO_DEFINE_EXPRESSION) {
        text = this._transformMacroDefineValue(child.lexeme, globalMap);
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
