import { GLESVisitor } from "./GLESVisitor";

export class GLES100Visitor extends GLESVisitor {
  versionText: string = "#version 100 es";

  override getAttributeDeclare() {
    return Array.from(this.context._referencedAttributeList.values())
      .map((item) => `attribute ${item.typeInfo.typeLexeme} ${item.ident.lexeme};`)
      .join("\n");
  }

  getVaryingDeclare(): string {
    return Array.from(this.context._referencedVaryingList.values())
      .map((item) => `varying ${item.typeInfo.typeLexeme} ${item.ident.lexeme};`)
      .join("\n");
  }
}
