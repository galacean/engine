import { GLESVisitor } from "./GLESVisitor";

export class GLES100Visitor extends GLESVisitor {
  versionText: string = "#version 100 es";

  override getAttributeDeclare(): [string, number][] {
    return Array.from(this.context._referencedAttributeList.values()).map((item) => [
      `attribute ${item.typeInfo.typeLexeme} ${item.ident.lexeme};`,
      item.ident.location.start.index
    ]);
  }

  override getVaryingDeclare(): [string, number][] {
    return Array.from(this.context._referencedVaryingList.values()).map((item) => [
      `varying ${item.typeInfo.typeLexeme} ${item.ident.lexeme};`,
      item.ident.location.start.index
    ]);
  }
}
