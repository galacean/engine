import { ASTNode, BaseToken, ParserUtils, TreeNode } from "@galacean/engine-shader-parser";
import type { ShaderRange } from "@galacean/engine-shader-parser";
import type { Diagnostic, DiagnosticCodeValue } from "./Diagnostic";
import { DiagnosticCode } from "./Diagnostic";

/**
 * Derives diagnostics by walking the fully-built AST and reading the semantic
 * clues each node already carries (types, locations). Runs after parse, fully
 * independent of code generation — judgments live here, not in parser/codegen.
 */
export class SemanticWalker {
  private _diagnostics: Diagnostic[];

  collect(program: TreeNode, diagnostics: Diagnostic[]): void {
    this._diagnostics = diagnostics;
    this._visit(program);
  }

  private _visit(node: TreeNode): void {
    this._check(node);
    const children = node.children;
    if (children) {
      for (const child of children) {
        if (child instanceof TreeNode) this._visit(child);
      }
    }
  }

  private _check(node: TreeNode): void {
    if (node instanceof ASTNode.PostfixExpression) {
      this._checkSwizzle(node);
    } else if (node instanceof ASTNode.IntegerConstantExpressionOperator && !node.compute) {
      // An operator without a `compute` clue is one the grammar accepted but we don't implement.
      this._report(DiagnosticCode.C0_02, `not implemented operator ${node.lexeme}`, node.location);
    }
  }

  /** C1-01: a `.field` access on a known vector must be a valid swizzle. */
  private _checkSwizzle(node: ASTNode.PostfixExpression): void {
    const children = node.children;
    if (children.length === 3 && children[2] instanceof BaseToken) {
      const base = children[0] as ASTNode.ExpressionAstNode;
      const error = ParserUtils.swizzleError(base.type, children[2].lexeme);
      if (error) this._report(DiagnosticCode.C1_01, error, children[2].location);
    }
  }

  private _report(code: DiagnosticCodeValue, message: string, loc: ShaderRange): void {
    this._diagnostics.push({
      severity: "error",
      code,
      message,
      range: {
        start: { line: loc.start.line, column: loc.start.column, offset: loc.start.index },
        end: { line: loc.end.line, column: loc.end.column, offset: loc.end.index }
      },
      source: "galacean-shader-analyzer"
    });
  }
}
