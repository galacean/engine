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
import type { DeferredDeclarationOwnership } from "@galacean/engine-shader-parser/internal";
import { ShaderInstructionEncoder } from "../ShaderInstructionEncoder";

const V3_GL_FragColor = "GS_glFragColor";
const V3_GL_FragData = "GS_glFragData";

export class GLES300Visitor extends GLESVisitor {
  private readonly _outputDeclarations = new Map<
    string,
    { text: string; owners: Map<number, DeferredDeclarationOwnership>; unconditional: boolean }
  >();
  private _fragDataArrayRequired = false;
  private readonly _fragDataIndices = new Map<ASTNode.PostfixExpression, number>();
  private readonly _scannedFragmentFunctions = new Set<ShaderEntryPointInfo["functions"][number]>();

  override reset(): void {
    super.reset();

    this._outputDeclarations.clear();
    this._fragDataArrayRequired = false;
    this._fragDataIndices.clear();
    this._scannedFragmentFunctions.clear();
  }

  override getOtherGlobal(data: ShaderData, out: ICodeSegment[]): void {
    super.getOtherGlobal(data, out);

    for (const output of this._outputDeclarations.values()) {
      out.push({
        text: output.unconditional
          ? output.text
          : ShaderInstructionEncoder.sharedDeclaration(output.text, Array.from(output.owners.values())),
        index: 0
      });
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

  private _registerFragColorVariable(): void {
    this._registerOutput(V3_GL_FragColor, `out vec4 ${V3_GL_FragColor};`);
  }

  private _registerOutput(name: string, text: string): void {
    let output = this._outputDeclarations.get(name);
    if (!output) this._outputDeclarations.set(name, (output = { text, owners: new Map(), unconditional: false }));
    const owner = this.currentDeclarationOwner;
    if (owner) output.owners.set(owner.id, owner);
    else output.unconditional = true;
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
    this._registerOutput(V3_GL_FragData, `layout(location = 0) out vec4 ${V3_GL_FragData}[gl_MaxDrawBuffers];`);
  }

  private _registerFragDataVariable(index: number): string {
    const name = `${V3_GL_FragData}${index}`;
    this._registerOutput(name, `layout(location = ${index}) out vec4 ${name};`);
    return name;
  }
}
