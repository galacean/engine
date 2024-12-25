import { CodeGenVisitor } from "./CodeGenVisitor";
import { ASTNode } from "../parser/AST";
import { ShaderData } from "../parser/ShaderInfo";
import { ESymbolType, FnSymbol, StructSymbol, SymbolInfo } from "../parser/symbolTable";
import { EShaderStage } from "../common/Enums";
import { IShaderInfo } from "@galacean/engine-design";
import { ICodeSegment } from "./types";
import { VisitorContext } from "./VisitorContext";
import { EKeyword } from "../common";

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
    const { symbolTable } = data;
    const fnSymbol = symbolTable.lookup(entry, ESymbolType.FN);
    if (!fnSymbol?.astNode) throw `no entry function found: ${entry}`;

    const fnNode = fnSymbol.astNode;
    VisitorContext.context.stage = EShaderStage.VERTEX;

    const returnType = fnNode.protoType.returnType;
    if (typeof returnType.type === "string") {
      const varyStruct = symbolTable.lookup(returnType.type, ESymbolType.STRUCT);
      if (!varyStruct) {
        this._reportError(returnType.location, `invalid varying struct: ${returnType.type}`);
      } else {
        VisitorContext.context.varyingStruct = varyStruct.astNode;
      }
    } else if (returnType.type !== EKeyword.VOID) {
      this._reportError(returnType.location, "vertex main entry can only return struct or void.");
    }

    const paramList = fnNode.protoType.parameterList;
    if (paramList?.length) {
      for (const paramInfo of paramList) {
        if (typeof paramInfo.typeInfo.type === "string") {
          const structSymbol = symbolTable.lookup(paramInfo.typeInfo.type, ESymbolType.STRUCT);
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

    this._getGlobalText(data, globalCodeArray);
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
    const { symbolTable } = data;
    const fnSymbol = symbolTable.lookup(entry, ESymbolType.FN);
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
      const mrtStruct = symbolTable.lookup(returnDataType, ESymbolType.STRUCT);
      if (!mrtStruct) {
        this._reportError(returnLocation, `invalid mrt struct: ${returnDataType}`);
      } else {
        context.mrtStruct = mrtStruct.astNode;
      }
    } else if (returnDataType !== EKeyword.VOID && returnDataType !== EKeyword.VEC4) {
      this._reportError(returnLocation, "fragment main entry can only return struct or vec4.");
    }

    const statements = fnNode.statements.codeGen(this);
    const { _globalCodeArray: globalCodeArray } = this;
    globalCodeArray.length = 0;

    this._getGlobalText(data, globalCodeArray);
    this.getVaryingDeclare(globalCodeArray);
    this.getMRTDeclare(globalCodeArray);

    const globalCode = globalCodeArray
      .sort((a, b) => a.index - b.index)
      .map((item) => item.text)
      .join("\n");

    context.reset();
    return `${this._versionText}\n${this._extensions}\n${defaultPrecision}\n${globalCode}\n\nvoid main() ${statements}`;
  }

  private _getGlobalText(
    data: ShaderData,
    textList: ICodeSegment[],
    lastLength: number = 0,
    _serialized: Set<string> = new Set()
  ): ICodeSegment[] {
    const { _referencedGlobals } = VisitorContext.context;

    if (lastLength === Object.keys(_referencedGlobals).length) {
      for (const precision of data.globalPrecisions) {
        textList.push({ text: precision.codeGen(this), index: precision.location.start.index });
      }
      return textList;
    }

    lastLength = Object.keys(_referencedGlobals).length;
    for (const ident in _referencedGlobals) {
      const sm = _referencedGlobals[ident];

      if (_serialized.has(ident)) continue;
      _serialized.add(ident);

      if (sm instanceof SymbolInfo) {
        if (sm.symbolType === ESymbolType.VAR) {
          textList.push({ text: `uniform ${sm.astNode.codeGen(this)}`, index: sm.astNode.location.start.index });
        } else {
          textList.push({ text: sm.astNode!.codeGen(this), index: sm.astNode!.location.start.index });
        }
      } else {
        textList.push({ text: sm.codeGen(this), index: sm.location.start.index });
      }
    }
    return this._getGlobalText(data, textList, lastLength, _serialized);
  }
}
