import { IShaderInfo } from "@galacean/engine-design";
import { EShaderStage } from "../common/Enums";
import { Keyword } from "../common/enums/Keyword";
import { ASTNode } from "../parser/AST";
import { ShaderData } from "../parser/ShaderInfo";
import { ESymbolType, FnSymbol, StructSymbol, SymbolInfo } from "../parser/symbolTable";
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

  abstract getMRTDeclare(out: ICodeSegment[]): void;

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
    VisitorContext.context._passSymbolTable = shaderData.symbolTable;

    const outerGlobalMacroDeclarations = shaderData.getOuterGlobalMacroDeclarations();

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
        const mrtStruct = <StructSymbol>symbolTable.getSymbol(lookupSymbol);
        if (!mrtStruct) {
          this._reportError(returnLocation, `invalid mrt struct: ${returnDataType}`);
        } else {
          context.mrtStruct = mrtStruct.astNode;
        }
      } else if (returnDataType !== Keyword.VOID && returnDataType !== Keyword.VEC4) {
        this._reportError(returnLocation, "fragment main entry can only return struct or vec4.");
      }
    });

    const globalCodeArray = this._globalCodeArray;
    VisitorContext.context.referenceGlobal(entry, ESymbolType.FN);

    this._getGlobalSymbol(globalCodeArray);
    this._getCustomStruct(context.varyingStructs, globalCodeArray);
    this.getMRTDeclare(globalCodeArray);
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

  private _getCustomStruct(structNode: ASTNode.StructSpecifier[], out: ICodeSegment[]): void {
    for (const node of structNode) {
      if (!node.isInMacroBranch) {
        const text = node.codeGen(this);
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

    context.getCacheCodeInMacroBranch = true;
    for (const macro of macros) {
      out.push({ text: macro.codeGen(this), index: macro.location.start.index });
    }
  }
}
