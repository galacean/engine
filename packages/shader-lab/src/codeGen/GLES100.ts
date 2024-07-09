import { GLESVisitor } from "./GLESVisitor";
import { ICodeSegment } from "./types";

export class GLES100Visitor extends GLESVisitor {
  versionText: string = "#version 100 es";

  override getAttributeDeclare(): ICodeSegment[] {
    const ret: ICodeSegment[] = [];
    for (const [_, item] of this.context._referencedAttributeList) {
      ret.push({
        text: `attribute ${item.typeInfo.typeLexeme} ${item.ident.lexeme};`,
        index: item.ident.location.start.index
      });
    }
    return ret;
  }

  override getVaryingDeclare(): ICodeSegment[] {
    const ret: ICodeSegment[] = [];
    for (const [_, item] of this.context._referencedVaryingList) {
      ret.push({
        text: `varying ${item.typeInfo.typeLexeme} ${item.ident.lexeme};`,
        index: item.ident.location.start.index
      });
    }
    return ret;
  }
}
