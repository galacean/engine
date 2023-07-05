import { CstElement, CstNode, ICstVisitor, IToken, CstChildrenDictionary } from "chevrotain";

import { AstNode, ObjectAstNode } from "./astNode";
import { IPosition, IPositionRange } from "./astNode/types";
import ShaderVisitor, { parser } from "./visitor";
import RuntimeContext from "./context";

export function isCstNode(node: any) {
  return !!node.children;
}

export function extractCstToken(
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
    if (isCstNode(value)) return opts?.fnNode?.(value) ?? extractCstToken(value, opts);
    else return opts?.fnToken?.(value) ?? value.image;
  }
  return undefined;
}

export function defaultVisit(this: ICstVisitor<any, AstNode>, ctx: CstChildrenDictionary): ObjectAstNode {
  const content = {} as Record<string, AstNode>;
  let start: IPosition = { line: Number.MAX_SAFE_INTEGER, offset: -1 },
    end: IPosition = { line: 0, offset: -1 };

  for (const k in ctx) {
    if (isCstNode(ctx[k][0])) {
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
      const position = getTokenPosition(token);
      if (position.start.line < start.line) {
        start = position.start;
      }
      if (position.end.line > end.line) {
        end = position.end;
      }
      content[k] = new AstNode({
        content: token.image,
        position
      });
    }
  }
  return new ObjectAstNode({ position: { start, end }, content });
}

/**
 * order not guaranteed
 */
export function extractCstString(node: CstElement): string[] {
  const ret: string[] = [];
  // @ts-ignore IToken
  if (node.image) return [node.image];
  // @ts-ignore CstNode
  if (node.name) {
    const $ = node as CstNode;
    for (const k in $.children) {
      // @ts-ignore
      const n: CstElement[] = $.children[k];
      if (!n) continue;
      for (const item of n) {
        ret.push(...extractCstString(item));
      }
    }
  }
  return ret;
}

/**
 * get token position
 */
export function getTokenPosition(token: IToken): IPositionRange {
  return {
    start: {
      line: token.startLine,
      offset: token.startColumn
    },
    end: {
      line: token.endLine,
      offset: token.endColumn
    }
  };
}

/**
 * get OR type CstNode position
 */
export function getOrTypeCstNodePosition(node: IToken | { children: CstChildrenDictionary }): IPositionRange {
  if (!isCstNode(node)) return getTokenPosition(node as IToken);
  const cstNode = node as CstNode;
  for (const k in cstNode.children) {
    const child = cstNode.children[k];
    if (!child) continue;

    return getOrTypeCstNodePosition(child[0]);
  }
}

export function astSortAsc(a: AstNode, b: AstNode) {
  return a.position.start.line > b.position.start.line ||
    (a.position.start.line === b.position.start.line && a.position.start.offset >= b.position.start.offset)
    ? 1
    : -1;
}

export function astSortDesc(a: AstNode, b: AstNode) {
  return -astSortAsc(a, b);
}

export function parseShader(input: string) {
  parser.parse(input);
  const cst = (parser as any).RuleShader();
  if (parser.errors.length > 0) {
    console.log(parser.errors);
    throw parser.errors;
  }

  const visitor = new ShaderVisitor();
  const ast = visitor.visit(cst);

  const context = new RuntimeContext();
  const shaderInfo = context.parse(ast);
  shaderInfo.diagnostics = context.diagnostics;
  return shaderInfo;
}
