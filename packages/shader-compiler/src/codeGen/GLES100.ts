import { ASTNode, ShaderStructRole, StructProp } from "@galacean/engine-shader-parser/internal";
import { GLESVisitor } from "./GLESVisitor";

export class GLES100Visitor extends GLESVisitor {
  protected override readonly supportsArrayStructReturn = false;
  protected override readonly inlineVoidFragmentEntry = true;
  override getAttributeProp(prop: StructProp): string {
    return `attribute ${prop.typeInfo.typeLexeme} ${prop.ident.lexeme};`;
  }

  override getVaryingProp(prop: StructProp): string {
    return `varying ${prop.typeInfo.typeLexeme} ${this.interfaceName(prop)};`;
  }

  override getMRTProp(): string {
    return "";
  }

  protected override fragmentColorOutput(): string {
    return "gl_FragColor";
  }

  protected override mrtOutput(prop: StructProp): string {
    return this.context.names.allocate(`mrt-parameter:${prop.mrtIndex}`, `output_${prop.ident.lexeme}`);
  }

  protected override transferOutputs(struct: ASTNode.StructSpecifier): { name: string; expression: string }[] {
    if (this.context.getStructRole([struct]) !== ShaderStructRole.Mrt) return [];
    const outputs = new Map<number, { name: string; expression: string }>();
    for (const prop of struct.propList) {
      if (!this.context._referencedMRTList[prop.ident.lexeme]?.includes(prop)) continue;
      const index = prop.mrtIndex!;
      // Keep legacy output built-ins in main so GLES100 text conversion can declare outputs before their use.
      outputs.set(index, { name: this.mrtOutput(prop), expression: `gl_FragData[${index}]` });
    }
    return Array.from(outputs.values());
  }
}
