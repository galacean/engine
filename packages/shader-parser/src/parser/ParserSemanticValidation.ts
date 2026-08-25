import { ETokenType, ShaderRange, TypeAny } from "../common";
import { isBranchReachable } from "../common/BranchAnalysis";
import { BaseToken as Token } from "../common/BaseToken";
import { Keyword } from "../common/enums/Keyword";
import { ASTNode, TreeNode } from "./AST";
import { VarSymbol } from "./symbolTable";
import { TypeSystem } from "./TypeSystem";

/** A semantic failure proven from parser-owned AST and symbol facts. @internal */
export interface ParserSemanticIssue {
  /** Stable diagnostic identifier shared by authoring and offline validation. */
  readonly code: string;
  /** Human-readable description of the proven failure. */
  readonly message: string;
  /** Source range that should be highlighted for the failure. */
  readonly location: ShaderRange;
}

/** Parser-owned semantic rules shared by Analyzer and offline admission. @internal */
export class ParserSemanticValidation {
  /**
   * Collects proven semantic failures from a complete parser IR.
   * @param root - Parsed translation-unit root.
   * @returns Failures from reachable source branches in source order.
   * @internal
   */
  static collect(root: TreeNode): ParserSemanticIssue[] {
    const issues: ParserSemanticIssue[] = [];
    const visit = (node: TreeNode): void => {
      if (!isBranchReachable(node._branch) || node._inMacroDefinition) return;
      if (node instanceof ASTNode.AssignmentExpression) {
        const targetIssue = this.assignmentTargetIssue(node);
        const typeIssue = this.assignmentTypeIssue(node);
        if (targetIssue) issues.push(targetIssue);
        if (typeIssue) issues.push(typeIssue);
      } else if (node instanceof ASTNode.SelectionStatement) {
        const issue = this.selectionConditionIssue(node);
        if (issue) issues.push(issue);
      } else if (node instanceof ASTNode.IterationStatement) {
        const issue = this.iterationConditionIssue(node);
        if (issue) issues.push(issue);
      } else if (node instanceof ASTNode.ConditionalExpression) {
        const issue = this.ternaryConditionIssue(node);
        if (issue) issues.push(issue);
      } else if (node instanceof ASTNode.FunctionCallGeneric) {
        const issue = this.constructorIssue(node);
        if (issue) issues.push(issue);
      } else if (node instanceof ASTNode.FunctionDeclarator) {
        const issue = this.functionReturnTypeIssue(node);
        if (issue) issues.push(issue);
      }
      for (const child of node.children) {
        if (child instanceof TreeNode) visit(child);
      }
    };
    visit(root);
    return issues;
  }

  /**
   * Describes why an expression cannot be modified.
   * @param node - Candidate assignment or increment target.
   * @returns A concrete reason only when every resolved symbol candidate is non-modifiable.
   * @internal
   */
  static nonAssignableReason(node: TreeNode): string | undefined {
    if (node instanceof ASTNode.ConditionalExpression && node.children.length > 1) {
      return "a ternary expression result";
    }
    if (
      (node instanceof ASTNode.LogicalOrExpression ||
        node instanceof ASTNode.LogicalXorExpression ||
        node instanceof ASTNode.LogicalAndExpression ||
        node instanceof ASTNode.InclusiveOrExpression ||
        node instanceof ASTNode.ExclusiveOrExpression ||
        node instanceof ASTNode.AndExpression ||
        node instanceof ASTNode.EqualityExpression ||
        node instanceof ASTNode.RelationalExpression ||
        node instanceof ASTNode.ShiftExpression ||
        node instanceof ASTNode.AdditiveExpression ||
        node instanceof ASTNode.MultiplicativeExpression) &&
      node.children.length > 1
    ) {
      return "a compound expression";
    }
    if (node instanceof ASTNode.UnaryExpression && node.children.length > 1) {
      return "a unary-operator result";
    }
    if (node instanceof ASTNode.FunctionCallGeneric) {
      return "a function call result";
    }
    if (node instanceof ASTNode.PostfixExpression) {
      const base = node.children[0];
      return base instanceof TreeNode
        ? ParserSemanticValidation.nonAssignableReason(base)
        : "an unassignable postfix expression";
    }
    if (node instanceof ASTNode.PrimaryExpression) {
      if (node.children.length === 1) {
        const child = node.children[0];
        if (child instanceof ASTNode.VariableIdentifier) return ParserSemanticValidation.nonAssignableReason(child);
        if (child instanceof Token) {
          if (child.type === ETokenType.INT_CONSTANT || child.type === ETokenType.FLOAT_CONSTANT) {
            return "a numeric literal";
          }
          if (child.type === Keyword.True || child.type === Keyword.False) return "a boolean literal";
        }
        return;
      }
      const inner = node.children[1];
      return inner instanceof TreeNode ? ParserSemanticValidation.nonAssignableReason(inner) : undefined;
    }
    if (node instanceof ASTNode.VariableIdentifier) {
      const child = node.children[0];
      if (child instanceof ASTNode.MacroCallSymbol || child instanceof ASTNode.MacroCallFunction) return;

      const symbols = node.resolvedValueSymbols();
      if (!symbols.length) return;
      let sharedReason: string | undefined;
      for (const symbol of symbols) {
        if (!(symbol instanceof VarSymbol)) return;
        const reason = symbol.isConst
          ? "a const-qualified variable"
          : TypeSystem.isSamplerType(symbol.dataType?.type)
            ? "a sampler"
            : symbol.isUniform
              ? "a uniform variable"
              : undefined;
        if (!reason) return;
        if (sharedReason && sharedReason !== reason) return "a non-modifiable variable";
        sharedReason = reason;
      }
      return sharedReason;
    }
    if (node.children.length === 1) {
      const child = node.children[0];
      if (child instanceof TreeNode) return ParserSemanticValidation.nonAssignableReason(child);
    }
    return;
  }

  /**
   * Validates an assignment target from parser-owned symbol identities.
   * @param node - Assignment expression to inspect.
   * @returns A proven invalid-target issue, or `undefined` for valid or unresolved targets.
   * @internal
   */
  static assignmentTargetIssue(node: ASTNode.AssignmentExpression): ParserSemanticIssue | undefined {
    if (node.children.length !== 3) return;
    const lhs = node.children[0];
    if (!(lhs instanceof ASTNode.ExpressionAstNode)) return;
    const reason = this.nonAssignableReason(lhs);
    return reason
      ? {
          code: "InvalidAssignmentTarget",
          message: `Cannot assign to ${reason} — the left operand of '=' must be a modifiable l-value.`,
          location: lhs.location
        }
      : undefined;
  }

  /**
   * Validates assignment operand compatibility.
   * @param node - Assignment expression to inspect.
   * @returns A proven type issue, or `undefined` when compatible or unresolved.
   * @internal
   */
  static assignmentTypeIssue(node: ASTNode.AssignmentExpression): ParserSemanticIssue | undefined {
    if (node.children.length !== 3) return;
    const lhs = node.children[0];
    const operator = node.children[1];
    const rhs = node.children[2];
    if (
      !(lhs instanceof ASTNode.ExpressionAstNode) ||
      !(operator instanceof ASTNode.AssignmentOperator) ||
      !(rhs instanceof ASTNode.AssignmentExpression)
    ) {
      return;
    }
    const operatorType = (operator.children[0] as Token | undefined)?.type;
    const compoundOperator =
      operatorType === ETokenType.MUL_ASSIGN
        ? "*"
        : operatorType === ETokenType.DIV_ASSIGN
          ? "/"
          : operatorType === ETokenType.MOD_ASSIGN
            ? "%"
            : operatorType === ETokenType.ADD_ASSIGN
              ? "+"
              : operatorType === ETokenType.SUB_ASSIGN
                ? "-"
                : undefined;
    const arithmetic = compoundOperator
      ? TypeSystem.arithmeticOperation(lhs.type, rhs.type, compoundOperator)
      : undefined;
    if (arithmetic?.valid === false) {
      return {
        code: "InvalidBinaryOperands",
        message: `Operator '${compoundOperator}=' cannot combine '${TypeSystem.typeName(lhs.type)}' and '${TypeSystem.typeName(rhs.type)}'.`,
        location: node.location
      };
    }
    const assignedType = arithmetic?.resultType ?? rhs.type;
    if (!TypeSystem.isAssignable(lhs.type, assignedType)) {
      return {
        code: "AssignTypeMismatch",
        message: `Cannot assign a value of type '${TypeSystem.typeName(rhs.type)}' to '${TypeSystem.typeName(lhs.type)}'.`,
        location: node.location
      };
    }
    return;
  }

  /**
   * Validates a condition that must be a scalar boolean.
   * @param condition - Typed condition expression.
   * @param label - User-facing construct name such as `if condition`.
   * @returns A proven non-boolean issue, or `undefined` when valid or unresolved.
   * @internal
   */
  static nonBoolConditionIssue(condition: ASTNode.ExpressionAstNode, label: string): ParserSemanticIssue | undefined {
    const type = condition.type;
    if (type === TypeAny || type === Keyword.BOOL) return;
    return {
      code: "NonBoolCondition",
      message: `${label[0].toUpperCase()}${label.slice(1)} must be a bool, got '${TypeSystem.typeName(type)}'.`,
      location: condition.location
    };
  }

  /**
   * Resolves and validates an `if` condition.
   * @param node - Selection statement.
   * @returns A proven condition issue, or `undefined`.
   * @internal
   */
  static selectionConditionIssue(node: ASTNode.SelectionStatement): ParserSemanticIssue | undefined {
    const condition = node.children.find((child) => child instanceof ASTNode.ExpressionAstNode);
    return condition instanceof ASTNode.ExpressionAstNode
      ? this.nonBoolConditionIssue(condition, "'if' condition")
      : undefined;
  }

  /**
   * Resolves and validates a loop condition.
   * @param node - Iteration statement.
   * @returns A proven condition issue, or `undefined`.
   * @internal
   */
  static iterationConditionIssue(node: ASTNode.IterationStatement): ParserSemanticIssue | undefined {
    const keyword = node.children[0];
    if (!(keyword instanceof Token)) return;
    let condition: ASTNode.Condition | undefined;
    let label: string;
    if (keyword.type === Keyword.WHILE) {
      const candidate = node.children[2];
      if (candidate instanceof ASTNode.Condition) condition = candidate;
      label = "'while' condition";
    } else if (keyword.type === Keyword.FOR) {
      const rest = node.children[3];
      const optionalCondition = rest instanceof ASTNode.ForRestStatement ? rest.children[0] : undefined;
      const candidate =
        optionalCondition instanceof ASTNode.ConditionOpt && optionalCondition.children.length === 1
          ? optionalCondition.children[0]
          : undefined;
      if (candidate instanceof ASTNode.Condition) condition = candidate;
      label = "'for' condition";
    } else {
      return;
    }
    if (!condition) return;
    const children = condition.children;
    const expression =
      children.length === 1 && children[0] instanceof ASTNode.ExpressionAstNode
        ? children[0]
        : children.length === 4 && children[3] instanceof ASTNode.ExpressionAstNode
          ? children[3]
          : undefined;
    return expression instanceof ASTNode.ExpressionAstNode ? this.nonBoolConditionIssue(expression, label) : undefined;
  }

  /**
   * Validates a ternary condition.
   * @param node - Conditional expression.
   * @returns A proven condition issue, or `undefined`.
   * @internal
   */
  static ternaryConditionIssue(node: ASTNode.ConditionalExpression): ParserSemanticIssue | undefined {
    const condition = node.children.length === 5 ? node.children[0] : undefined;
    return condition instanceof ASTNode.ExpressionAstNode
      ? this.nonBoolConditionIssue(condition, "ternary condition")
      : undefined;
  }

  /**
   * Validates the component contract of a builtin constructor.
   * @param node - Function-call node representing a possible constructor.
   * @returns A proven constructor issue, or `undefined` when valid or unresolved.
   * @internal
   */
  static constructorIssue(node: ASTNode.FunctionCallGeneric): ParserSemanticIssue | undefined {
    const functionIdentifier = node.children[0] as ASTNode.FunctionIdentifier;
    if (!functionIdentifier.isBuiltin) return;
    const list = node.children.length === 4 ? node.children[2] : undefined;
    if (!(list instanceof ASTNode.FunctionCallParameterList)) return;
    const badIndex = list.paramSig.findIndex((type) => TypeSystem.isSamplerType(type) || typeof type === "string");
    if (badIndex >= 0) {
      const argument = list.paramNodes[badIndex];
      return {
        code: "ConstructorArgType",
        message: `Cannot construct '${TypeSystem.typeName(functionIdentifier.ident)}' from a '${TypeSystem.typeName(list.paramSig[badIndex])}' argument.`,
        location: argument instanceof TreeNode ? argument.location : list.location
      };
    }

    const matrixComponents = TypeSystem.matrixComponentCount(functionIdentifier.ident);
    const requiredComponents = TypeSystem.vectorComponentCount(functionIdentifier.ident) || matrixComponents;
    if (requiredComponents <= 0) return;
    if (matrixComponents > 0 && list.paramSig.length === 1 && TypeSystem.matrixComponentCount(list.paramSig[0]) > 0) {
      return;
    }
    if (
      matrixComponents === 0 &&
      list.paramSig.length === 1 &&
      TypeSystem.vectorComponentCount(list.paramSig[0]) >= requiredComponents
    ) {
      return;
    }
    let providedComponents = 0;
    let countable = list.paramSig.length > 0;
    for (const type of list.paramSig) {
      const components = TypeSystem.isScalarType(type)
        ? 1
        : TypeSystem.vectorComponentCount(type) || TypeSystem.matrixComponentCount(type);
      if (components === 0) {
        countable = false;
        break;
      }
      providedComponents += components;
    }
    const singleScalar = list.paramSig.length === 1 && TypeSystem.isScalarType(list.paramSig[0]);
    return countable && !singleScalar && providedComponents !== requiredComponents
      ? {
          code: "ConstructorArgCount",
          message: `Constructor '${TypeSystem.typeName(functionIdentifier.ident)}' needs ${requiredComponents} components but the arguments provide ${providedComponents}.`,
          location: list.location
        }
      : undefined;
  }

  /**
   * Validates that a function return type can be passed by value.
   * @param node - Function declarator with its exact parser-resolved return type.
   * @returns A proven opaque-return issue, or `undefined` when constructible or unresolved.
   * @internal
   */
  static functionReturnTypeIssue(node: ASTNode.FunctionDeclarator): ParserSemanticIssue | undefined {
    const returnType = node.returnType;
    const type = returnType.type;
    if (TypeSystem.isSamplerType(type)) {
      return {
        code: "NonConstructibleReturnType",
        message: `Function return type '${TypeSystem.typeName(type)}' is not constructible; samplers cannot be returned.`,
        location: returnType.location
      };
    }
    if (
      typeof type === "string" &&
      returnType.typeSpecifier.structDeclarations.some((declaration) =>
        this._structContainsSampler(declaration, new Set())
      )
    ) {
      return {
        code: "NonConstructibleReturnType",
        message: `Function return type '${type}' is not constructible; structs containing samplers cannot be returned.`,
        location: returnType.location
      };
    }
    return;
  }

  private static _structContainsSampler(
    declaration: ASTNode.StructSpecifier,
    visited: Set<ASTNode.StructSpecifier>
  ): boolean {
    if (visited.has(declaration)) return false;
    visited.add(declaration);
    for (const property of declaration.propList) {
      if (TypeSystem.isSamplerType(property.typeInfo.type)) return true;
      for (const nestedDeclaration of property.typeInfo.structDeclarations) {
        if (this._structContainsSampler(nestedDeclaration, visited)) return true;
      }
    }
    return false;
  }
}
