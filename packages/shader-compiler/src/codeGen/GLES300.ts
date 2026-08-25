import { EShaderStage } from "@galacean/engine-shader-parser/internal";
import { ASTNode } from "@galacean/engine-shader-parser/internal";
import { ShaderData } from "@galacean/engine-shader-parser/internal";
import { ShaderBuiltinSemantic } from "@galacean/engine-shader-parser/internal";
import { ParserUtils } from "@galacean/engine-shader-parser/internal";
import { ShaderEntryPointInfo } from "@galacean/engine-shader-parser/internal";
import { TreeNode } from "@galacean/engine-shader-parser/internal";
import { StructProp } from "@galacean/engine-shader-parser/internal";
import { GLESVisitor } from "./GLESVisitor";
import { ICodeSegment } from "./types";

const V3_GL_FragColor = "GS_glFragColor";
const V3_GL_FragData = "GS_glFragData";

export class GLES300Visitor extends GLESVisitor {
  private _otherCodeArray: ICodeSegment[] = [];
  private _fragColorVariableRegistered = false;
  private _fragDataArrayRequired = false;
  private _fragDataArrayRegistered = false;
  private readonly _fragDataIndices = new Map<ASTNode.PostfixExpression, number>();
  private readonly _fragDataVariables = new Map<number, string>();
  private readonly _scannedFragmentFunctions = new Set<ShaderEntryPointInfo["functions"][number]>();

  override reset(): void {
    super.reset();

    this._otherCodeArray.length = 0;
    this._fragColorVariableRegistered = false;
    this._fragDataArrayRequired = false;
    this._fragDataArrayRegistered = false;
    this._fragDataIndices.clear();
    this._fragDataVariables.clear();
    this._scannedFragmentFunctions.clear();
  }

  override getOtherGlobal(data: ShaderData, out: ICodeSegment[]): void {
    super.getOtherGlobal(data, out);

    for (let i = 0, n = this._otherCodeArray.length; i < n; i++) {
      out.push(this._otherCodeArray[i]);
    }
  }

  override getAttributeProp(prop: StructProp): string {
    return `in ${prop.typeInfo.typeLexeme} ${prop.ident.lexeme};`;
  }

  override getVaryingProp(prop: StructProp): string {
    const qualifier = this.context.stage === EShaderStage.FRAGMENT ? "in" : "out";
    return `${qualifier} ${prop.typeInfo.typeLexeme} ${prop.ident.lexeme};`;
  }

  override getMRTProp(prop: StructProp): string {
    return `layout(location = ${prop.mrtIndex}) out vec4 ${prop.ident.lexeme};`;
  }

  override visitFunctionIdentifier(node: ASTNode.FunctionIdentifier): string {
    const children = node.children;
    const typeSpecifier = children[0] as ASTNode.TypeSpecifier;
    if (typeSpecifier.children.length !== 1) {
      return this.defaultCodeGen(children);
    }
    let ident = node.lexeme;
    switch (node.ident) {
      case "texture2D":
      case "textureCube":
        ident = "texture";
        break;
      case "texture2DProj":
        ident = "textureProj";
        break;
      case "texture2DLodEXT":
      case "textureCubeLodEXT":
        ident = "textureLod";
        break;
      case "texture2DGradEXT":
      case "textureCubeGradEXT":
        ident = "textureGrad";
        break;
      case "texture2DProjLodEXT":
        ident = "textureProjLod";
        break;
      case "texture2DProjGradEXT":
        ident = "textureProjGrad";
        break;
    }
    return ident;
  }

  override visitVariableIdentifier(node: ASTNode.VariableIdentifier): string {
    const context = this.context;
    if (context.stage === EShaderStage.FRAGMENT && node.builtinSemantic === ShaderBuiltinSemantic.FragmentOutput0) {
      this._registerFragColorVariable();
      return V3_GL_FragColor;
    }
    if (context.stage === EShaderStage.FRAGMENT && node.builtinSemantic === ShaderBuiltinSemantic.FragmentDepth) {
      return "gl_FragDepth";
    }
    if (context.stage === EShaderStage.FRAGMENT && node.builtinSemantic === ShaderBuiltinSemantic.FragmentOutputArray) {
      this._registerFragDataArray();
      return V3_GL_FragData;
    }
    return super.visitVariableIdentifier(node);
  }

  override visitPostfixExpression(node: ASTNode.PostfixExpression): string {
    if (!this._fragDataArrayRequired) {
      const index = this._fragDataIndices.get(node);
      if (index !== undefined) return this._registerFragDataVariable(index);
    }
    return super.visitPostfixExpression(node);
  }

  override visitJumpStatement(node: ASTNode.JumpStatement): string {
    const mode = this.context.getFragmentReturnMode(node);
    const terminal = this.context.isTerminalInterfaceReturn(node);
    if (mode === "mrt") return terminal ? "" : "return;";
    if (mode === "color") {
      this._registerFragColorVariable();

      const expression = node.children[1] as ASTNode.Expression;
      return `${V3_GL_FragColor} = ${expression.codeGen(this)};${terminal ? "" : " return;"}`;
    }
    return super.visitJumpStatement(node);
  }

  private _registerFragColorVariable() {
    if (this._fragColorVariableRegistered) return;
    this._otherCodeArray.push({
      text: `out vec4 ${V3_GL_FragColor};`,
      index: 0
    });
    this._fragColorVariableRegistered = true;
  }

  protected override prepareFragment(
    entryInfo: ShaderEntryPointInfo,
    outerGlobalMacroStatements: readonly ASTNode.GlobalDeclaration[]
  ): void {
    const pending = entryInfo.functions.slice();
    while (pending.length) {
      const fn = pending.pop()!;
      if (this._scannedFragmentFunctions.has(fn)) continue;
      this._scannedFragmentFunctions.add(fn);
      this._scanFragmentOutputs(fn.astNode);
      pending.push(...fn.calledFunctions);
    }
    for (const macro of outerGlobalMacroStatements) this._scanFragmentOutputs(macro);
  }

  private _scanFragmentOutputs(node: TreeNode): void {
    if (node instanceof ASTNode.PostfixExpression && node.children.length === 4) {
      const base = node.children[0];
      const index = node.children[2];
      if (
        base instanceof TreeNode &&
        index instanceof TreeNode &&
        ParserUtils.unwrapBareIdentifier(base, { allowParens: true })?.builtinSemantic ===
          ShaderBuiltinSemantic.FragmentOutputArray
      ) {
        const value = ParserUtils.constIntegerValue(index);
        if (value === undefined || value < 0) this._fragDataArrayRequired = true;
        else this._fragDataIndices.set(node, value);
        this._scanFragmentOutputs(index);
        return;
      }
    }
    if (
      node instanceof ASTNode.VariableIdentifier &&
      node.builtinSemantic === ShaderBuiltinSemantic.FragmentOutputArray
    ) {
      this._fragDataArrayRequired = true;
      return;
    }
    for (const child of node.children) {
      if (child instanceof TreeNode) this._scanFragmentOutputs(child);
    }
  }

  private _registerFragDataArray(): void {
    if (this._fragDataArrayRegistered) return;
    this._otherCodeArray.push({
      text: `layout(location = 0) out vec4 ${V3_GL_FragData}[gl_MaxDrawBuffers];`,
      index: 0
    });
    this._fragDataArrayRegistered = true;
  }

  private _registerFragDataVariable(index: number): string {
    const existing = this._fragDataVariables.get(index);
    if (existing) return existing;
    const name = `${V3_GL_FragData}${index}`;
    this._fragDataVariables.set(index, name);
    this._otherCodeArray.push({
      text: `layout(location = ${index}) out vec4 ${name};`,
      index: 0
    });
    return name;
  }
}
