import { CodeGenVisitor } from "./CodeGenVisitor";
import { Logger } from "../Logger";
import { ASTNode } from "../Parser/AST";
import { GLPassShaderData } from "../Parser/ShaderInfo";
import { ESymbolType } from "../Parser/SymbolTable";
import { EShaderStage } from "./constants";

export abstract class GLESVisitor extends CodeGenVisitor {
  abstract versionText: string;

  override visitPassProgram(node: ASTNode.GLPassProgram, renderStates: IRenderState): IPassCodeGenResult {
    const mergedStates: IRenderState = [
      { ...renderStates[0], ...node.shaderData.renderStates[0] },
      { ...renderStates[1], ...node.shaderData.renderStates[1] }
    ];
    const { vertexMain, fragmentMain } = node.shaderData;
    this.context._passSymbolTable = node.shaderData.symbolTable;

    return {
      name: node.name,
      vertexSource: this.vertexMain(vertexMain, node.shaderData),
      fragmentSource: this.fragmentMain(fragmentMain, node.shaderData),
      renderStates: mergedStates,
      tags: node.shaderData.tags
    };
  }

  vertexMain(fnNode: ASTNode.FunctionDefinition, data: GLPassShaderData): string {
    const { symbolTable } = data;

    this.context.stage = EShaderStage.VERTEX;

    const returnType = fnNode.protoType.returnType;
    if (typeof returnType.type !== "string") {
      this.logger.log(Logger.RED, "main entry can only return struct.");
    } else {
      const varyStruct = symbolTable.lookup(returnType.type, ESymbolType.STRUCT);
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
          const structSymbol = symbolTable.lookup(paramInfo.typeInfo.type, ESymbolType.STRUCT);
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

    const attributeDeclare = this.getAttributeDeclare();
    const varyingDeclare = this.getVaryingDeclare();
    const globalText = this.getGlobalText();

    this.context.reset();

    return `${this.versionText}\n\n${attributeDeclare}\n${varyingDeclare}\n\n${globalText}\n\nvoid main() ${statements}`;
  }

  private fragmentMain(fnNode: ASTNode.FunctionDefinition, data: GLPassShaderData): string {
    this.context.stage = EShaderStage.FRAGMENT;
    const statements = fnNode.statements.codeGen(this);
    const varyingDeclare = this.getVaryingDeclare();
    const globalText = this.getGlobalText();

    this.context.reset();
    return `${this.versionText}\n\n${varyingDeclare}\n\n${globalText}\n\nvoid main() ${statements}`;
  }

  private getGlobalText(
    textList: [string, number][] = [],
    lastLength: number = 0,
    _serialized: Set<string> = new Set()
  ): string {
    const { _referencedGlobals } = this.context;

    if (lastLength === _referencedGlobals.size) {
      // TODO
      return textList
        .sort((a, b) => a[1] - b[1])
        .map((item) => item[0])
        .join("\n");
    }

    lastLength = _referencedGlobals.size;
    for (const [ident, sm] of _referencedGlobals) {
      if (_serialized.has(ident)) continue;
      _serialized.add(ident);

      if (sm.symType === ESymbolType.VAR) {
        textList.push([`uniform ${sm.symDataType!.typeLexeme} ${sm.lexeme};`, 0]);
      } else {
        textList.push([sm.astNode!.codeGen(this), sm.astNode!.location.start.index]);
      }
    }
    return this.getGlobalText(textList, lastLength, _serialized);
  }

  abstract getAttributeDeclare(): string;
  abstract getVaryingDeclare(): string;
}
