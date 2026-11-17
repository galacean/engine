import { ASTNode, BaseToken, Keyword, ParserUtils, TreeNode } from "@galacean/engine-shader-parser/internal/analyzer";
import { ShaderConditionDiagram } from "./ShaderConditionDiagram";

interface Flow {
  next: number;
  /** Return, discard, or nontermination. */
  stop: number;
  breaks: number;
  continues: number;
}

type Visit =
  | { node: TreeNode; output: Flow[] }
  | { selection: ASTNode.SelectionStatement; left: Flow[]; right: Flow[]; output: Flow[] }
  | {
      loop: ASTNode.IterationStatement;
      body: Flow[];
      invariant: boolean | undefined;
      entry: boolean | undefined;
      output: Flow[];
    };

const { FALSE, TRUE, UNKNOWN } = ShaderConditionDiagram;
const MAX_CONDITION_WORK = 1024;
const NEXT: Flow = { next: TRUE, stop: FALSE, breaks: FALSE, continues: FALSE };
const STOP: Flow = { next: FALSE, stop: TRUE, breaks: FALSE, continues: FALSE };
const BREAK: Flow = { next: FALSE, stop: FALSE, breaks: TRUE, continues: FALSE };
const CONTINUE: Flow = { next: FALSE, stop: FALSE, breaks: FALSE, continues: TRUE };

/**
 * Finds macro configurations in which control can reach the end of a function.
 * @internal
 */
export function getFallthroughCondition(root: TreeNode, diagram: ShaderConditionDiagram): number {
  const output: Flow[] = [];
  const pending: Visit[] = [{ node: root, output }];
  while (pending.length) {
    const current = pending.pop()!;
    if ("selection" in current) {
      const left = sequence(current.left, diagram);
      const right = sequence(current.right, diagram);
      current.output.push({
        next: diagram.or(left.next, right.next),
        stop: diagram.or(left.stop, right.stop),
        breaks: diagram.or(left.breaks, right.breaks),
        continues: diagram.or(left.continues, right.continues)
      });
      continue;
    }
    if ("loop" in current) {
      const body = sequence(current.body, diagram);
      const repeat = diagram.or(body.next, body.continues);
      const onlyBreak = diagram.and(body.breaks, diagram.not(diagram.or(body.stop, repeat)));
      // Repeated execution is unresolved unless the condition is invariant
      const next =
        current.invariant === true
          ? diagram.or(onlyBreak, diagram.and(body.breaks, UNKNOWN))
          : current.entry === true
            ? diagram.or(onlyBreak, diagram.and(diagram.or(body.breaks, repeat), UNKNOWN))
            : diagram.or(onlyBreak, UNKNOWN);
      const stop =
        current.invariant === true
          ? diagram.or(body.stop, repeat)
          : current.entry === true
            ? diagram.or(body.stop, diagram.and(repeat, UNKNOWN))
            : diagram.and(diagram.or(body.stop, repeat), UNKNOWN);
      const branch = diagram.branch(current.loop._branch, true);
      current.output.push({
        next: diagram.or(diagram.not(branch), diagram.and(branch, next)),
        stop: diagram.and(branch, stop),
        breaks: FALSE,
        continues: FALSE
      });
      continue;
    }

    const { node, output } = current;
    if (node instanceof ASTNode.JumpStatement) {
      const keyword = (node.children[0] as BaseToken).type;
      const branch = diagram.branch(node._branch, true);
      if (branch === FALSE) continue;
      if (branch === TRUE) {
        output.push(keyword === Keyword.BREAK ? BREAK : keyword === Keyword.CONTINUE ? CONTINUE : STOP);
        continue;
      }
      output.push({
        next: diagram.not(branch),
        stop: keyword === Keyword.RETURN || keyword === Keyword.DISCARD ? branch : FALSE,
        breaks: keyword === Keyword.BREAK ? branch : FALSE,
        continues: keyword === Keyword.CONTINUE ? branch : FALSE
      });
    } else if (node instanceof ASTNode.SelectionStatement) {
      const condition = booleanValue(node.children[2] as TreeNode);
      if (condition !== undefined) {
        const selected = node.children[condition ? 4 : 6];
        if (selected instanceof TreeNode) pending.push({ node: selected, output });
      } else {
        const left: Flow[] = [],
          right: Flow[] = [];
        pending.push({ selection: node, left, right, output });
        if (node.children[6] instanceof TreeNode) pending.push({ node: node.children[6], output: right });
        pending.push({ node: node.children[4] as TreeNode, output: left });
      }
    } else if (node instanceof ASTNode.IterationStatement) {
      const condition = (
        node.children.length === 5 ? node.children[2] : (node.children[3] as TreeNode).children[0]
      ) as TreeNode;
      const invariant = booleanValue(condition);
      const initial = invariant === undefined ? loopInitializer(node) : undefined;
      const entry = initial ? booleanValue(condition, initial) : invariant;
      if (entry === false) continue;
      const body: Flow[] = [];
      pending.push({ loop: node, body, invariant, entry, output });
      pending.push({ node: node.children[node.children.length - 1] as TreeNode, output: body });
    } else if (
      node instanceof ASTNode.Statement ||
      node instanceof ASTNode.SimpleStatement ||
      node instanceof ASTNode.CompoundStatement ||
      node instanceof ASTNode.CompoundStatementNoScope ||
      node instanceof ASTNode.StatementList ||
      node instanceof ASTNode.MacroIfStatement ||
      node instanceof ASTNode.MacroBranch
    ) {
      // Flatten left-recursive lists before combining conditions
      for (let index = node.children.length - 1; index >= 0; index--) {
        const child = node.children[index];
        if (child instanceof TreeNode) pending.push({ node: child, output });
      }
    }
  }
  return sequence(output, diagram).next;
}

function sequence(flows: Flow[], diagram: ShaderConditionDiagram): Flow {
  if (!flows.length) return NEXT;
  if (flows.length === 1) return flows[0];
  let result = NEXT;
  const nonNext: number[] = [],
    stops: number[] = [];
  const flush = () => {
    if (!nonNext.length) return;
    result = append(
      result,
      {
        next: diagram.not(diagram.orAll(nonNext)),
        stop: diagram.orAll(stops),
        breaks: FALSE,
        continues: FALSE
      },
      diagram
    );
    nonNext.length = stops.length = 0;
  };
  for (const flow of flows) {
    if (flow.breaks === FALSE && flow.continues === FALSE) {
      // Balanced unions avoid retaining every prefix of long macro return lists
      nonNext.push(diagram.not(flow.next));
      stops.push(flow.stop);
    } else {
      flush();
      result = append(result, flow, diagram);
    }
    if (result.next === FALSE) break;
  }
  flush();
  return result;
}

function append(left: Flow, right: Flow, diagram: ShaderConditionDiagram): Flow {
  if (left === NEXT) return right;
  return {
    next: diagram.and(left.next, right.next),
    stop: diagram.or(left.stop, diagram.and(left.next, right.stop)),
    breaks: diagram.or(left.breaks, diagram.and(left.next, right.breaks)),
    continues: diagram.or(left.continues, diagram.and(left.next, right.continues))
  };
}

function loopInitializer(loop: ASTNode.IterationStatement): ASTNode.VariableDeclaratorInfo | undefined {
  if (loop.children.length !== 6) return;
  const declaration = (loop.children[2] as ASTNode.ForInitStatement).children[0];
  if (!(declaration instanceof ASTNode.Declaration)) return;
  const list = declaration.children[0];
  // Additional initializers can mutate the first variable before the condition
  if (!(list instanceof ASTNode.InitDeclaratorList) || list.children.length !== 1) return;
  return (list.children[0] as ASTNode.SingleDeclaration).declarator;
}

function booleanValue(
  node: TreeNode,
  initial?: ASTNode.VariableDeclaratorInfo,
  work = { remaining: MAX_CONDITION_WORK }
): boolean | undefined {
  while (true) {
    if (--work.remaining < 0) return;
    const children = node.children;
    if (node instanceof ASTNode.PrimaryExpression && children.length === 3) {
      node = children[1] as TreeNode;
    } else if (children.length === 1 && children[0] instanceof TreeNode) {
      node = children[0];
    } else {
      break;
    }
  }
  const children = node.children;
  if (node instanceof ASTNode.PrimaryExpression && children[0] instanceof BaseToken) {
    if (children[0].type === Keyword.True) return true;
    if (children[0].type === Keyword.False) return false;
  }
  if (node instanceof ASTNode.UnaryExpression && children.length === 2) {
    const operator = children[0] instanceof BaseToken ? children[0] : children[0].children[0];
    if (operator instanceof BaseToken && operator.lexeme === "!") {
      const value = booleanValue(children[1] as TreeNode, initial, work);
      return value === undefined ? undefined : !value;
    }
  }
  if (children.length !== 3 || !(children[0] instanceof TreeNode) || !(children[2] instanceof TreeNode)) return;
  const operator = children[1];
  if (!(operator instanceof BaseToken)) return;
  if (operator.lexeme === "&&" || operator.lexeme === "||") {
    const left = booleanValue(children[0], initial, work);
    if (left === (operator.lexeme === "||")) return left;
    // An unknown operand may change the initialized variable before the next operand
    if (left === undefined && initial) return;
    const right = booleanValue(children[2], initial, work);
    return left === undefined && right !== (operator.lexeme === "||" ? true : false) ? undefined : right;
  }
  if (!(node instanceof ASTNode.RelationalExpression || node instanceof ASTNode.EqualityExpression)) return;
  const left = integerValue(children[0], work, initial);
  const right = integerValue(children[2], work, initial);
  if (left === undefined || right === undefined) return;
  switch (operator.lexeme) {
    case "<":
      return left < right;
    case "<=":
      return left <= right;
    case ">":
      return left > right;
    case ">=":
      return left >= right;
    case "==":
      return left === right;
    case "!=":
      return left !== right;
  }
}

function integerValue(
  node: TreeNode,
  work: { remaining: number },
  initial?: ASTNode.VariableDeclaratorInfo
): number | undefined {
  if (initial?.initializer && (initial.typeInfo.type === Keyword.INT || initial.typeInfo.type === Keyword.UINT)) {
    const identifier = ParserUtils.unwrapBareIdentifier(node, { allowParens: true });
    const symbols = identifier?.resolvedSymbols();
    if (symbols?.length === 1 && symbols[0] === initial.symbol) {
      const value = ParserUtils.constIntegerValue(initial.initializer, work);
      return value === undefined ? undefined : initial.typeInfo.type === Keyword.UINT ? value >>> 0 : value | 0;
    }
  }
  return ParserUtils.constIntegerValue(node, work);
}
