import { CodeGenVisitor } from "./CodeGenVisitor";
import { GLESVisitor } from "./GLESVisitor";
import { VisitorContext } from "./VisitorContext";
import { ICodeSegment } from "./types";

export class GLES100Visitor extends GLESVisitor {
  versionText: string = "#version 100 es";

  private static _singleton: GLES100Visitor;
  static getVisitor(): GLES100Visitor {
    if (!this._singleton) {
      this._singleton = new GLES100Visitor();
    }
    return this._singleton;
  }

  override getAttributeDeclare(): ICodeSegment[] {
    const ret: ICodeSegment[] = [];
    for (const [_, item] of VisitorContext.context._referencedAttributeList) {
      ret.push({
        text: `attribute ${item.typeInfo.typeLexeme} ${item.ident.lexeme};`,
        index: item.ident.location.start.index
      });
    }
    return ret;
  }

  override getVaryingDeclare(): ICodeSegment[] {
    const ret: ICodeSegment[] = [];
    for (const [_, item] of VisitorContext.context._referencedVaryingList) {
      ret.push({
        text: `varying ${item.typeInfo.typeLexeme} ${item.ident.lexeme};`,
        index: item.ident.location.start.index
      });
    }
    return ret;
  }
}
