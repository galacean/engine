const WATER_SHADER_TEMPLATE_TOKEN_PATTERN = /\{\{([A-Z][A-Z0-9_]*)\}\}/g;
const WATER_SHADER_TEMPLATE_UNRESOLVED_PATTERN = /\{\{[^{}]+\}\}/;
const WATER_SHADER_IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const WATER_SHADER_CONDITIONAL_DIRECTIVE_PATTERN = /^(\s*#\s*)(if|ifdef|ifndef|elif|else|endif)\b(.*?)(\r?\n)?$/;

interface WaterShaderConditionalDirective {
  readonly keyword: "if" | "ifdef" | "ifndef" | "elif" | "else" | "endif";
  readonly expression: string;
  readonly source: string;
}

interface WaterShaderConditionalBranch {
  readonly directive: WaterShaderConditionalDirective;
  readonly body: readonly WaterShaderSyntaxNode[];
}

interface WaterShaderConditionalNode {
  readonly branches: readonly WaterShaderConditionalBranch[];
  readonly endif: WaterShaderConditionalDirective;
}

type WaterShaderSyntaxNode = string | WaterShaderConditionalNode;

interface WaterShaderSequence {
  readonly nodes: readonly WaterShaderSyntaxNode[];
  readonly nextLine: number;
  readonly terminator?: WaterShaderConditionalDirective;
}

class WaterShaderNumericExpressionParser {
  private _position = 0;

  constructor(private readonly _source: string) {}

  parse(): number | undefined {
    try {
      const value = this._parseLogicalOr();
      this._skipWhitespace();
      return this._position === this._source.length && Number.isFinite(value) ? value : undefined;
    } catch {
      return undefined;
    }
  }

  private _parseLogicalOr(): number {
    let value = this._parseLogicalAnd();
    while (this._match("||")) {
      const right = this._parseLogicalAnd();
      value = Number(Boolean(value) || Boolean(right));
    }
    return value;
  }

  private _parseLogicalAnd(): number {
    let value = this._parseEquality();
    while (this._match("&&")) {
      const right = this._parseEquality();
      value = Number(Boolean(value) && Boolean(right));
    }
    return value;
  }

  private _parseEquality(): number {
    let value = this._parseRelational();
    for (;;) {
      if (this._match("==")) value = Number(value === this._parseRelational());
      else if (this._match("!=")) value = Number(value !== this._parseRelational());
      else return value;
    }
  }

  private _parseRelational(): number {
    let value = this._parseAdditive();
    for (;;) {
      if (this._match(">=")) value = Number(value >= this._parseAdditive());
      else if (this._match("<=")) value = Number(value <= this._parseAdditive());
      else if (this._match(">")) value = Number(value > this._parseAdditive());
      else if (this._match("<")) value = Number(value < this._parseAdditive());
      else return value;
    }
  }

  private _parseAdditive(): number {
    let value = this._parseMultiplicative();
    for (;;) {
      if (this._match("+")) value += this._parseMultiplicative();
      else if (this._match("-")) value -= this._parseMultiplicative();
      else return value;
    }
  }

  private _parseMultiplicative(): number {
    let value = this._parseUnary();
    for (;;) {
      if (this._match("*")) value *= this._parseUnary();
      else if (this._match("/")) value /= this._parseUnary();
      else if (this._match("%")) value %= this._parseUnary();
      else return value;
    }
  }

  private _parseUnary(): number {
    if (this._match("!")) return Number(!this._parseUnary());
    if (this._match("+")) return this._parseUnary();
    if (this._match("-")) return -this._parseUnary();
    return this._parsePrimary();
  }

  private _parsePrimary(): number {
    if (this._match("(")) {
      const value = this._parseLogicalOr();
      if (!this._match(")")) throw new Error("Unclosed numeric Water shader expression.");
      return value;
    }

    this._skipWhitespace();
    const match = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/.exec(this._source.slice(this._position));
    if (!match) throw new Error("Expected a numeric Water shader expression.");
    this._position += match[0].length;
    return Number(match[0]);
  }

  private _match(token: string): boolean {
    this._skipWhitespace();
    if (!this._source.startsWith(token, this._position)) return false;
    this._position += token.length;
    return true;
  }

  private _skipWhitespace(): void {
    while (/\s/.test(this._source[this._position] ?? "")) this._position++;
  }
}

function parseWaterShaderDirective(line: string): WaterShaderConditionalDirective | undefined {
  const match = WATER_SHADER_CONDITIONAL_DIRECTIVE_PATTERN.exec(line);
  if (!match) return undefined;
  return {
    keyword: match[2] as WaterShaderConditionalDirective["keyword"],
    expression: match[3].replace(/\/\/.*$/, "").trim(),
    source: line
  };
}

function parseWaterShaderSequence(
  lines: readonly string[],
  startLine: number,
  terminators: ReadonlySet<WaterShaderConditionalDirective["keyword"]>
): WaterShaderSequence {
  const nodes: WaterShaderSyntaxNode[] = [];
  let lineIndex = startLine;
  while (lineIndex < lines.length) {
    const directive = parseWaterShaderDirective(lines[lineIndex]);
    if (directive && terminators.has(directive.keyword)) {
      return { nodes, nextLine: lineIndex, terminator: directive };
    }
    if (directive && (directive.keyword === "if" || directive.keyword === "ifdef" || directive.keyword === "ifndef")) {
      const conditional = parseWaterShaderConditional(lines, lineIndex, directive);
      nodes.push(conditional.node);
      lineIndex = conditional.nextLine;
      continue;
    }
    if (directive && (directive.keyword === "elif" || directive.keyword === "else" || directive.keyword === "endif")) {
      throw new Error(`Unmatched Water shader #${directive.keyword} directive.`);
    }
    nodes.push(lines[lineIndex]);
    lineIndex++;
  }
  return { nodes, nextLine: lineIndex };
}

function parseWaterShaderConditional(
  lines: readonly string[],
  startLine: number,
  firstDirective: WaterShaderConditionalDirective
): { readonly node: WaterShaderConditionalNode; readonly nextLine: number } {
  const branches: WaterShaderConditionalBranch[] = [];
  let directive = firstDirective;
  let bodyStart = startLine + 1;

  for (;;) {
    const sequence = parseWaterShaderSequence(lines, bodyStart, new Set(["elif", "else", "endif"]));
    branches.push({ directive, body: sequence.nodes });
    const terminator = sequence.terminator;
    if (!terminator) throw new Error(`Water shader #${firstDirective.keyword} has no matching #endif.`);
    if (terminator.keyword === "endif") {
      return { node: { branches, endif: terminator }, nextLine: sequence.nextLine + 1 };
    }

    directive = terminator;
    bodyStart = sequence.nextLine + 1;
    if (terminator.keyword === "else") {
      const elseSequence = parseWaterShaderSequence(lines, bodyStart, new Set(["endif"]));
      branches.push({ directive, body: elseSequence.nodes });
      if (elseSequence.terminator?.keyword !== "endif") {
        throw new Error(`Water shader #${firstDirective.keyword} #else has no matching #endif.`);
      }
      return {
        node: { branches, endif: elseSequence.terminator },
        nextLine: elseSequence.nextLine + 1
      };
    }
  }
}

function evaluateWaterShaderNumericExpression(expression: string): boolean | undefined {
  const value = new WaterShaderNumericExpressionParser(expression).parse();
  return value === undefined ? undefined : Boolean(value);
}

function renderWaterShaderSyntaxNodes(nodes: readonly WaterShaderSyntaxNode[]): string {
  return nodes
    .map((node) => {
      if (typeof node === "string") return node;
      const isStatic =
        node.branches[0].directive.keyword === "if" &&
        node.branches.every(
          ({ directive }) =>
            directive.keyword === "else" || evaluateWaterShaderNumericExpression(directive.expression) !== undefined
        );
      if (isStatic) {
        const selected = node.branches.find(
          ({ directive }) =>
            directive.keyword === "else" || evaluateWaterShaderNumericExpression(directive.expression) === true
        );
        return selected ? renderWaterShaderSyntaxNodes(selected.body) : "";
      }
      return `${node.branches
        .map(({ directive, body }) => `${directive.source}${renderWaterShaderSyntaxNodes(body)}`)
        .join("")}${node.endif.source}`;
    })
    .join("");
}

/** Removes only fully numeric conditional groups before Engine shader compilation. */
export function pruneWaterShaderStaticBranches(source: string): string {
  const lines = source.match(/.*(?:\n|$)/g)?.filter(Boolean) ?? [];
  return renderWaterShaderSyntaxNodes(parseWaterShaderSequence(lines, 0, new Set()).nodes);
}

/** Renders a shader template while enforcing an exact named-token contract. */
export function renderWaterShaderTemplate(
  template: string,
  replacements: Readonly<Record<string, string | number>>
): string {
  const tokens = new Set<string>();
  for (const match of template.matchAll(WATER_SHADER_TEMPLATE_TOKEN_PATTERN)) {
    tokens.add(match[1]);
  }

  const replacementKeys = Object.keys(replacements);
  const missingTokens = [...tokens].filter((token) => !Object.hasOwn(replacements, token));
  const unknownTokens = replacementKeys.filter((token) => !tokens.has(token));
  if (missingTokens.length > 0 || unknownTokens.length > 0) {
    const details = [
      missingTokens.length > 0 ? `missing: ${missingTokens.sort().join(", ")}` : "",
      unknownTokens.length > 0 ? `unknown: ${unknownTokens.sort().join(", ")}` : ""
    ].filter(Boolean);
    throw new Error(`Invalid water shader template replacements (${details.join("; ")}).`);
  }

  const rendered = template.replace(WATER_SHADER_TEMPLATE_TOKEN_PATTERN, (_match, token: string) =>
    String(replacements[token])
  );
  const unresolvedToken = rendered.match(WATER_SHADER_TEMPLATE_UNRESOLVED_PATTERN)?.[0];
  if (unresolvedToken) {
    throw new Error(`Unresolved water shader template token ${unresolvedToken}.`);
  }
  return pruneWaterShaderStaticBranches(rendered);
}

function validateWaterShaderIdentifier(role: string, identifier: string): void {
  if (!WATER_SHADER_IDENTIFIER_PATTERN.test(identifier)) {
    throw new TypeError(`Invalid water shader ${role} identifier '${identifier}'.`);
  }
}

/** Renders a generic function-result assignment while keeping business GLSL in shader modules. */
export function renderWaterShaderFunctionAssignment(
  target: string,
  functionName: string,
  args: readonly string[],
  declarationType?: string
): string {
  validateWaterShaderIdentifier("target", target);
  validateWaterShaderIdentifier("function", functionName);
  if (declarationType !== undefined) validateWaterShaderIdentifier("declaration type", declarationType);
  if (args.length === 0 || args.some((argument) => argument.trim().length === 0)) {
    throw new TypeError(`Water shader function '${functionName}' requires non-empty arguments.`);
  }
  return `${declarationType ? `${declarationType} ` : ""}${target} = ${functionName}(${args.join(", ")});`;
}

/** Renders a generic value assignment for an expression already owned by the calling shader module. */
export function renderWaterShaderValueAssignment(target: string, valueExpression: string): string {
  validateWaterShaderIdentifier("target", target);
  if (valueExpression.trim().length === 0) {
    throw new TypeError(`Water shader target '${target}' requires a non-empty value expression.`);
  }
  return `${target} = ${valueExpression};`;
}
