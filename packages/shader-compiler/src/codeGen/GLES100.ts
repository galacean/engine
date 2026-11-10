import { StructProp } from "@galacean/engine-shader-parser/internal";
import { GLESVisitor } from "./GLESVisitor";

export class GLES100Visitor extends GLESVisitor {
  protected override readonly supportsArrayStructReturn = false;
  override getAttributeProp(prop: StructProp): string {
    return `attribute ${prop.typeInfo.typeLexeme} ${prop.ident.lexeme};`;
  }

  override getVaryingProp(prop: StructProp): string {
    return `varying ${prop.typeInfo.typeLexeme} ${this.interfaceName(prop)}${prop.typeInfo.arraySpecifier?.codeGen(this) ?? ""};`;
  }

  override getMRTProp(): string {
    return "";
  }

  protected override fragmentColorOutput(): string {
    return "gl_FragColor";
  }

  protected override mrtOutput(prop: StructProp): string {
    return `gl_FragData[${prop.mrtIndex!}]`;
  }
}
