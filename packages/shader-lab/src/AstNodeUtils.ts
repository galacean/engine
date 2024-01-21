import { CstChildrenDictionary, CstNode, ICstVisitor, IToken } from "chevrotain";

import { AstNode, ObjectAstNode } from "./ast-node";
import { IPosition, IPositionRange } from "./ast-node/";

interface IWithPosition {
  position: IPositionRange;
}

export class AstNodeUtils {
  static isCstNode(node: any) {
    return !!node.children;
  }

  /**
   * return token's image if not specify options
   */
  static extractCstToken(
    ctx: CstNode | CstChildrenDictionary,
    opts?: {
      fnToken?: (element: IToken) => any;
      fnNode?: (element: CstNode) => any;
    }
  ): any {
    if (!ctx) return undefined;

    const obj = ctx.children ?? ctx;
    for (const tk in obj) {
      const value = obj[tk][0];
      if (AstNodeUtils.isCstNode(value)) return opts?.fnNode?.(value) ?? AstNodeUtils.extractCstToken(value, opts);
      else return opts?.fnToken?.(value) ?? value.image;
    }
    return undefined;
  }

  static defaultVisit(this: ICstVisitor<any, AstNode>, ctx: CstChildrenDictionary): ObjectAstNode {
    const content = {} as Record<string, AstNode>;
    let start: IPosition = { line: Number.MAX_SAFE_INTEGER, character: -1, index: -1 },
      end: IPosition = { line: 0, character: -1, index: -1 };

    for (const k in ctx) {
      if (AstNodeUtils.isCstNode(ctx[k][0])) {
        const astInfo = this.visit(ctx[k][0] as CstNode);
        if (astInfo.position.start.line < start.line) {
          start = astInfo.position.start;
        }
        if (astInfo.position.end.line > end.line) {
          end = astInfo.position.end;
        }
        content[k] = astInfo;
      } else {
        const token = ctx[k][0] as IToken;
        const position = AstNodeUtils.getTokenPosition(token);
        if (position.start.line < start.line) {
          start = position.start;
        }
        if (position.end.line > end.line) {
          end = position.end;
        }
        content[k] = new AstNode(position, token.image);
      }
    }
    return new ObjectAstNode({ start, end }, content);
  }

  static getTokenPosition(token: IToken): IPositionRange {
    return {
      start: {
        line: token.startLine,
        character: token.startColumn,
        index: token.startOffset
      },
      end: {
        line: token.endLine,
        character: token.endColumn,
        index: token.endOffset
      }
    };
  }

  /**
   * get OR-Type CstNode position
   */
  static getOrTypeCstNodePosition(node: IToken | { children: CstChildrenDictionary }): IPositionRange {
    if (!AstNodeUtils.isCstNode(node)) return AstNodeUtils.getTokenPosition(node as IToken);
    const cstNode = node as CstNode;
    for (const k in cstNode.children) {
      const child = cstNode.children[k];
      if (!child) continue;

      return AstNodeUtils.getOrTypeCstNodePosition(child[0]);
    }
  }

  static astSortAsc(a: IWithPosition, b: IWithPosition) {
    return a.position.start.line > b.position.start.line ||
      (a.position.start.line === b.position.start.line && a.position.start.character >= b.position.start.character)
      ? 1
      : -1;
  }

  static astSortDesc(a: IWithPosition, b: IWithPosition) {
    return -AstNodeUtils.astSortAsc(a, b);
  }
}
