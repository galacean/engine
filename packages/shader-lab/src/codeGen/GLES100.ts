import { GLESVisitor } from "./GLESVisitor";
import { VisitorContext } from "./VisitorContext";
import { ICodeSegment } from "./types";

export class GLES100Visitor extends GLESVisitor {
  override _versionText: string = `#version 100`;
  override _extensions: string = [
    "GL_EXT_shader_texture_lod",
    "GL_OES_standard_derivatives",
    "GL_EXT_draw_buffers",
    "GL_EXT_frag_depth"
  ]
    .map((e) => `#extension ${e} : enable\n`)
    .join("");

  private static _singleton: GLES100Visitor;
  static getVisitor(): GLES100Visitor {
    if (!this._singleton) {
      this._singleton = new GLES100Visitor();
    }
    return this._singleton;
  }

  override getAttributeDeclare(): ICodeSegment[] {
    const ret: ICodeSegment[] = [];
    for (const item of Object.values(VisitorContext.context._referencedAttributeList)) {
      ret.push({
        text: `attribute ${item.typeInfo.typeLexeme} ${item.ident.lexeme};`,
        index: item.ident.location.start.index
      });
    }
    return ret;
  }

  override getVaryingDeclare(): ICodeSegment[] {
    const ret: ICodeSegment[] = [];
    for (const item of Object.values(VisitorContext.context._referencedVaryingList)) {
      ret.push({
        text: `varying ${item.typeInfo.typeLexeme} ${item.ident.lexeme};`,
        index: item.ident.location.start.index
      });
    }
    return ret;
  }
}
