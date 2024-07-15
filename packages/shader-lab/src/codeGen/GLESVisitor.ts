import { CodeGenVisitor } from "./CodeGenVisitor";
import { ASTNode } from "../parser/AST";
import { ShaderData } from "../parser/ShaderInfo";
import { ESymbolType, FnSymbol, StructSymbol, SymbolInfo } from "../parser/symbolTable";
import { EShaderStage } from "../common/Enums";
import { IShaderInfo } from "@galacean/engine-design";
import { ICodeSegment } from "./types";
import { Logger } from "@galacean/engine";
import { VisitorContext } from "./VisitorContext";

const defaultPrecision = `precision mediump float;`;

export abstract class GLESVisitor extends CodeGenVisitor {
  abstract versionText: string;

  abstract getAttributeDeclare(): ICodeSegment[];
  abstract getVaryingDeclare(): ICodeSegment[];

  visitShaderProgram(node: ASTNode.GLShaderProgram, vertexEntry: string, fragmentEntry: string): IShaderInfo {
    VisitorContext.reset();
    VisitorContext.context._passSymbolTable = node.shaderData.symbolTable;

    return {
      vertex: this.vertexMain(vertexEntry, node.shaderData),
      fragment: this._fragmentMain(fragmentEntry, node.shaderData)
    };
  }

  vertexMain(entry: string, data: ShaderData): string {
    const { symbolTable } = data;
    const fnSymbol = symbolTable.lookup<FnSymbol>({ ident: entry, symbolType: ESymbolType.FN });
    if (!fnSymbol?.astNode) throw `no entry function found: ${entry}`;

    const fnNode = fnSymbol.astNode;
    VisitorContext.context.stage = EShaderStage.VERTEX;

    const returnType = fnNode.protoType.returnType;
    if (typeof returnType.type !== "string") {
      Logger.warn("main entry can only return struct.");
    } else {
      const varyStruct = symbolTable.lookup<StructSymbol>({ ident: returnType.type, symbolType: ESymbolType.STRUCT });
      if (!varyStruct) {
        Logger.warn("invalid varying struct:", returnType.type);
      } else {
        VisitorContext.context.varyingStruct = varyStruct.astNode;
      }
    }

    const paramList = fnNode.protoType.parameterList;
    if (paramList?.length) {
      for (const paramInfo of paramList) {
        if (typeof paramInfo.typeInfo.type === "string") {
          const structSymbol = symbolTable.lookup<StructSymbol>({
            ident: paramInfo.typeInfo.type,
            symbolType: ESymbolType.STRUCT
          });
          if (!structSymbol) {
            Logger.warn("no attribute struct found.");
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
    const globalText = this._getGlobalText(data);

    const attributeDeclare = this.getAttributeDeclare();
    const varyingDeclare = this.getVaryingDeclare();

    const globalCode = [...globalText, ...attributeDeclare, ...varyingDeclare]
      .sort((a, b) => a.index - b.index)
      .map((item) => item.text)
      .join("\n");

    VisitorContext.context.reset();

    return `${this.versionText}\n${defaultPrecision}\n${globalCode}\n\nvoid main() ${statements}`;
  }

  private _fragmentMain(entry: string, data: ShaderData): string {
    const { symbolTable } = data;
    const fnSymbol = symbolTable.lookup<FnSymbol>({ ident: entry, symbolType: ESymbolType.FN });
    if (!fnSymbol?.astNode) throw `no entry function found: ${entry}`;
    const fnNode = fnSymbol.astNode;

    VisitorContext.context.stage = EShaderStage.FRAGMENT;
    const statements = fnNode.statements.codeGen(this);
    const globalText = this._getGlobalText(data);
    const varyingDeclare = this.getVaryingDeclare();

    const globalCode = [...globalText, ...varyingDeclare]
      .sort((a, b) => a.index - b.index)
      .map((item) => item.text)
      .join("\n");

    VisitorContext.context.reset();
    return `${this.versionText}\n${defaultPrecision}\n${globalCode}\n\nvoid main() ${statements}`;
  }

  private _getGlobalText(
    data: ShaderData,
    textList: ICodeSegment[] = [],
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
