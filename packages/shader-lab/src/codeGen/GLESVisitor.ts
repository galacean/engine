import { CodeGenVisitor } from "./CodeGenVisitor";
import { Logger } from "../Logger";
import { ASTNode } from "../parser/AST";
import { ShaderData } from "../parser/ShaderInfo";
import { ESymbolType, FnSymbol, StructSymbol, SymbolInfo } from "../parser/symbolTable";
import { EShaderStage } from "./constants";
import { IPassCodeGenResult } from "./types";

type ICodeSegment = [string, number];

const defaultPrecision = `precision mediump float;`;

export abstract class GLESVisitor extends CodeGenVisitor {
  abstract versionText: string;

  override visitShaderProgram(
    node: ASTNode.GLShaderProgram,
    vertexEntry: string,
    fragmentEntry: string
  ): IPassCodeGenResult {
    this.context._passSymbolTable = node.shaderData.symbolTable;

    return {
      vertexSource: this.vertexMain(vertexEntry, node.shaderData),
      fragmentSource: this.fragmentMain(fragmentEntry, node.shaderData)
    };
  }

  vertexMain(entry: string, data: ShaderData): string {
    const { symbolTable } = data;
    const fnSymbol = symbolTable.lookup<FnSymbol>({ ident: entry, symbolType: ESymbolType.FN });
    if (!fnSymbol?.astNode) throw `no entry function found: ${entry}`;

    const fnNode = fnSymbol.astNode;
    this.context.stage = EShaderStage.VERTEX;

    const returnType = fnNode.protoType.returnType;
    if (typeof returnType.type !== "string") {
      this.logger.log(Logger.RED, "main entry can only return struct.");
    } else {
      const varyStruct = symbolTable.lookup<StructSymbol>({ ident: returnType.type, symbolType: ESymbolType.STRUCT });
      if (!varyStruct) {
        this.logger.log(Logger.RED, "invalid varying struct:", returnType.type);
      } else {
        this.context.varyingStruct = varyStruct.astNode;
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
            this.logger.log(Logger.YELLOW, "no attribute struct found.");
            continue;
          }
          this.context.attributeStructs.push(structSymbol.astNode);
          for (const prop of structSymbol.astNode.propList) {
            this.context.attributeList.push(prop);
          }
        } else {
          this.context.attributeList.push(paramInfo);
        }
      }
    }

    const statements = fnNode.statements.codeGen(this);
    const globalText = this.getGlobalText(data);

    const attributeDeclare = this.getAttributeDeclare();
    const varyingDeclare = this.getVaryingDeclare();

    const globalCode = [...globalText, ...attributeDeclare, ...varyingDeclare]
      .sort((a, b) => a[1] - b[1])
      .map((item) => item[0])
      .join("\n");

    this.context.reset();

    return `${this.versionText}\n${defaultPrecision}\n${globalCode}\n\nvoid main() ${statements}`;
  }

  private fragmentMain(entry: string, data: ShaderData): string {
    const { symbolTable } = data;
    const fnSymbol = symbolTable.lookup<FnSymbol>({ ident: entry, symbolType: ESymbolType.FN });
    if (!fnSymbol?.astNode) throw `no entry function found: ${entry}`;
    const fnNode = fnSymbol.astNode;

    this.context.stage = EShaderStage.FRAGMENT;
    const statements = fnNode.statements.codeGen(this);
    const globalText = this.getGlobalText(data);
    const varyingDeclare = this.getVaryingDeclare();

    const globalCode = [...globalText, ...varyingDeclare]
      .sort((a, b) => a[1] - b[1])
      .map((item) => item[0])
      .join("\n");

    this.context.reset();
    return `${this.versionText}\n${defaultPrecision}\n${globalCode}\n\nvoid main() ${statements}`;
  }

  private getGlobalText(
    data: ShaderData,
    textList: [string, number][] = [],
    lastLength: number = 0,
    _serialized: Set<string> = new Set()
  ): ICodeSegment[] {
    const { _referencedGlobals } = this.context;

    if (lastLength === _referencedGlobals.size) {
      for (const precision of data.globalPrecisions) {
        textList.push([precision.codeGen(this), precision.location.start.index]);
      }
      return textList;
    }

    lastLength = _referencedGlobals.size;
    for (const [ident, sm] of _referencedGlobals) {
      if (_serialized.has(ident)) continue;
      _serialized.add(ident);

      if (sm instanceof SymbolInfo) {
        if (sm.symbolType === ESymbolType.VAR) {
          textList.push([`uniform ${sm.astNode.codeGen(this)}`, sm.astNode.location.start.index]);
        } else {
          textList.push([sm.astNode!.codeGen(this), sm.astNode!.location.start.index]);
        }
      } else {
        textList.push([sm.codeGen(this), sm.location.start.index]);
      }
    }
    return this.getGlobalText(data, textList, lastLength, _serialized);
  }

  abstract getAttributeDeclare(): ICodeSegment[];
  abstract getVaryingDeclare(): ICodeSegment[];
}
