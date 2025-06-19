import { IShaderInfo } from "@galacean/engine-design";
import { EShaderStage } from "../common/Enums";
import { Keyword } from "../common/enums/Keyword";
import { ASTNode } from "../parser/AST";
import { ShaderData } from "../parser/ShaderInfo";
import { ESymbolType, FnSymbol, StructSymbol, SymbolInfo } from "../parser/symbolTable";
import { CodeGenVisitor } from "./CodeGenVisitor";
import { ICodeSegment } from "./types";
import { VisitorContext } from "./VisitorContext";

const defaultPrecision = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
  precision highp float;
  precision highp int;
#else
  precision mediump float;
  precision mediump int;
#endif
`;

/**
 * @internal
 */
export abstract class GLESVisitor extends CodeGenVisitor {
  protected _versionText: string = "";
  protected _extensions: string = "";
  private _globalCodeArray: ICodeSegment[] = [];
  private static _lookupSymbol: SymbolInfo = new SymbolInfo("", null);
  private static _serializedGlobalKey = new Set();

  abstract getAttributeDeclare(out: ICodeSegment[]): void;
  abstract getVaryingDeclare(out: ICodeSegment[]): void;
  abstract getMRTDeclare(out: ICodeSegment[]): void;

  visitShaderProgram(node: ASTNode.GLShaderProgram, vertexEntry: string, fragmentEntry: string): IShaderInfo {
    // #if _VERBOSE
    this.errors.length = 0;
    // #endif
    VisitorContext.reset();
    VisitorContext.context._passSymbolTable = node.shaderData.symbolTable;

    return {
      vertex: this.vertexMain(vertexEntry, node.shaderData),
      fragment: this._fragmentMain(fragmentEntry, node.shaderData)
    };
  }

  vertexMain(entry: string, data: ShaderData): string {
    const lookupSymbol = GLESVisitor._lookupSymbol;
    const { symbolTable } = data;
    lookupSymbol.set(entry, ESymbolType.FN);
    const fnSymbol = <FnSymbol>symbolTable.lookup(lookupSymbol);
    if (!fnSymbol?.astNode) throw `no entry function found: ${entry}`;

    const fnNode = fnSymbol.astNode;
    VisitorContext.context.stage = EShaderStage.VERTEX;

    const returnType = fnNode.protoType.returnType;
    if (typeof returnType.type === "string") {
      lookupSymbol.set(returnType.type, ESymbolType.STRUCT);
      const varyStruct = <StructSymbol>symbolTable.lookup(lookupSymbol);
      if (!varyStruct) {
        this._reportError(returnType.location, `invalid varying struct: ${returnType.type}`);
      } else {
        VisitorContext.context.varyingStruct = varyStruct.astNode;
      }
    } else if (returnType.type !== Keyword.VOID) {
      this._reportError(returnType.location, "vertex main entry can only return struct or void.");
    }

    const paramList = fnNode.protoType.parameterList;
    if (paramList?.length) {
      for (const paramInfo of paramList) {
        if (typeof paramInfo.typeInfo.type === "string") {
          lookupSymbol.set(paramInfo.typeInfo.type, ESymbolType.STRUCT);
          const structSymbol = <StructSymbol>symbolTable.lookup(lookupSymbol);
          if (!structSymbol) {
            this._reportError(paramInfo.astNode.location, `Not found attribute struct "${paramInfo.typeInfo.type}".`);
            continue;
          }
          VisitorContext.context.attributeStructs.push(structSymbol.astNode);
          for (const prop of structSymbol.astNode.propList) {
            VisitorContext.context.attributeList.push(prop);
          }
        } else {
          VisitorContext.context.attributeList.push(paramInfo);
        }
      }
    }

    const statements = fnNode.statements.codeGen(this);

    const { _globalCodeArray: globalCodeArray } = this;
    globalCodeArray.length = 0;
    GLESVisitor._serializedGlobalKey.clear();

    this._getGlobalSymbol(globalCodeArray);
    this._getGlobalPrecisions(data.globalPrecisions, globalCodeArray);
    this.getAttributeDeclare(globalCodeArray);
    this.getVaryingDeclare(globalCodeArray);

    const globalCode = globalCodeArray
      .sort((a, b) => a.index - b.index)
      .map((item) => item.text)
      .join("\n");

    VisitorContext.context.reset();

    return `${this._versionText}\n${globalCode}\n\nvoid main() ${statements}`;
  }

  private _fragmentMain(entry: string, data: ShaderData): string {
    const lookupSymbol = GLESVisitor._lookupSymbol;
    const { symbolTable } = data;
    lookupSymbol.set(entry, ESymbolType.FN);
    const fnSymbol = <FnSymbol>symbolTable.lookup(lookupSymbol);
    if (!fnSymbol?.astNode) throw `no entry function found: ${entry}`;
    const fnNode = fnSymbol.astNode;

    const { returnStatement } = fnNode;
    if (returnStatement) {
      returnStatement.isFragReturnStatement = true;
    }

    const { context } = VisitorContext;
    context.stage = EShaderStage.FRAGMENT;

    const { type: returnDataType, location: returnLocation } = fnNode.protoType.returnType;
    if (typeof returnDataType === "string") {
      lookupSymbol.set(returnDataType, ESymbolType.STRUCT);
      const mrtStruct = <StructSymbol>symbolTable.lookup(lookupSymbol);
      if (!mrtStruct) {
        this._reportError(returnLocation, `invalid mrt struct: ${returnDataType}`);
      } else {
        context.mrtStruct = mrtStruct.astNode;
      }
    } else if (returnDataType !== Keyword.VOID && returnDataType !== Keyword.VEC4) {
      this._reportError(returnLocation, "fragment main entry can only return struct or vec4.");
    }

    const statements = fnNode.statements.codeGen(this);
    const { _globalCodeArray: globalCodeArray } = this;
    globalCodeArray.length = 0;
    GLESVisitor._serializedGlobalKey.clear();

    this._getGlobalSymbol(globalCodeArray);
    this._getGlobalPrecisions(data.globalPrecisions, globalCodeArray);
    this.getVaryingDeclare(globalCodeArray);
    this.getMRTDeclare(globalCodeArray);

    const globalCode = globalCodeArray
      .sort((a, b) => a.index - b.index)
      .map((item) => item.text)
      .join("\n");

    context.reset();
    return `${this._versionText}\n${this._extensions}\n${defaultPrecision}\n${globalCode}\n\nvoid main() ${statements}`;
  }

  private _getGlobalSymbol(out: ICodeSegment[]): void {
    const { _referencedGlobals } = VisitorContext.context;

    const lastLength = Object.keys(_referencedGlobals).length;

    for (const ident in _referencedGlobals) {
      if (GLESVisitor._serializedGlobalKey.has(ident)) continue;
      GLESVisitor._serializedGlobalKey.add(ident);

      const symbol = _referencedGlobals[ident];
      const symbols = Array.isArray(symbol) ? symbol : [symbol];
      for (let i = 0; i < symbols.length; i++) {
        const sm = symbols[i];
        out.push({
          text: `${sm.type === ESymbolType.VAR ? "uniform " : ""}${sm.astNode.codeGen(this)}`,
          index: sm.astNode.location.start.index
        });
      }
    }

    if (Object.keys(_referencedGlobals).length !== lastLength) {
      this._getGlobalSymbol(out);
    }
  }

  private _getGlobalPrecisions(precisions: ASTNode.PrecisionSpecifier[], out: ICodeSegment[]): void {
    for (const precision of precisions) {
      out.push({ text: precision.codeGen(this), index: precision.location.start.index });
    }
  }
}
