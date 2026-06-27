import {
  ASTNode,
  DiagnosticType,
  GSError,
  GSErrorName,
  Keyword,
  ShaderCompilerUtils,
  TreeNode,
  TypeAny,
  TypeSystem
} from "@galacean/engine-shader-parser";

/**
 * Post-parse validation pass. Walks the already-typed AST (the parser built the symbol table and
 * inferred `.type` inline; only validation moved here) and collects diagnostics. The pass source is
 * passed in — `parseShaderPass` clears `ShaderCompilerUtils.processingPassText` on exit, so the
 * caller supplies the same source context the inline check carried.
 */
export class ShaderValidator {
  static validate(program: ASTNode.GLShaderProgram, source: string): GSError[] {
    const errors: GSError[] = [];
    ShaderValidator._walk(program, source, errors);
    return errors;
  }

  private static _walk(node: TreeNode, source: string, errors: GSError[]): void {
    if (node instanceof ASTNode.SelectionStatement) {
      ShaderValidator._checkNonBoolCondition(node, source, errors);
    }
    const children = node.children;
    if (children) {
      for (const child of children) {
        if (child instanceof TreeNode) ShaderValidator._walk(child, source, errors);
      }
    }
  }

  /**
   * `if (cond)` — cond must be a bool. GLSL ES has no implicit scalar→bool, so a float/int
   * condition is an error. Skip TypeAny (unknown) to avoid false positives (continue-with-unknown).
   */
  private static _checkNonBoolCondition(node: ASTNode.SelectionStatement, source: string, errors: GSError[]): void {
    const condition = node.children.find((c) => c instanceof ASTNode.ExpressionAstNode) as
      | ASTNode.ExpressionAstNode
      | undefined;
    if (!condition) return;
    const t = condition.type;
    if (t !== TypeAny && t !== Keyword.BOOL) {
      errors.push(
        <GSError>(
          ShaderCompilerUtils.createGSError(
            `Condition of 'if' must be a bool, got '${TypeSystem.typeName(t)}'.`,
            GSErrorName.CompilationError,
            source,
            condition.location,
            DiagnosticType.NonBoolCondition
          )
        )
      );
    }
  }
}
