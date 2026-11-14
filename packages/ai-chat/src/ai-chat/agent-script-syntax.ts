import { parse, type Node } from "acorn";
import type { AgentScriptError } from "./agent-types";

type SyntaxNode = Node & { [key: string]: any };

/** The execute language contract, shared by preflight, checking and execution. */
export function analyzeAgentScript(source: string): {
  references: readonly string[];
  error?: AgentScriptError;
  errorStack?: string;
} {
  let ast: SyntaxNode;
  try {
    // The default input is an async function body. These options let us inspect
    // the original source without adding lines to diagnostics or trace records.
    ast = parse(source, {
      ecmaVersion: "latest",
      sourceType: "script",
      locations: true,
      allowAwaitOutsideFunction: true,
      allowReturnOutsideFunction: true
    }) as SyntaxNode;
  } catch (error) {
    const failure = error as Error & { loc?: { line: number; column: number } };
    return {
      references: [],
      errorStack: failure.stack,
      error: {
        code: "SCRIPT_SYNTAX_ERROR",
        phase: "parse",
        message: `Agent Script syntax error: ${failure.message}`,
        ...(failure.loc
          ? { location: { source: "execute.code", line: failure.loc.line, column: failure.loc.column + 1 } }
          : {})
      }
    };
  }
  const references = new Set<string>();
  let forbidden: string | undefined;
  const toolPath = (node: SyntaxNode): string[] | undefined => {
    if (node.type === "Identifier") return node.name === "tools" ? [] : undefined;
    if (node.type !== "MemberExpression" || node.computed || node.property.type !== "Identifier") return undefined;
    const parent = toolPath(node.object);
    return parent && [...parent, node.property.name];
  };
  const visit = (node: SyntaxNode, parent?: SyntaxNode) => {
    if (node.type === "ImportExpression") forbidden = "dynamic import";
    if (node.type === "CallExpression" && node.callee.type === "Identifier" && node.callee.name === "eval")
      forbidden = "eval";
    if (node.type === "MemberExpression" && !(parent?.type === "MemberExpression" && parent.object === node)) {
      const path = toolPath(node);
      if (path?.length) references.add(path.join("."));
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) {
        for (const child of value) if (child && typeof child.type === "string") visit(child, node);
      } else if (value && typeof value === "object" && typeof value.type === "string") visit(value, node);
    }
  };
  visit(ast);
  const message = forbidden ? `Agent Script cannot use ${forbidden}` : undefined;
  return {
    references: [...references],
    ...(message ? { error: { code: "SCRIPT_UNSUPPORTED", phase: "parse", message } as AgentScriptError } : {})
  };
}
