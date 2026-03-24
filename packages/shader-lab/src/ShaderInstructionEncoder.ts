import type { Condition, ShaderInstruction } from "@galacean/engine-design";

export type { ShaderInstruction } from "@galacean/engine-design";

/** Must stay in sync with ShaderPreprocessorDirective in @galacean/engine-core */
const ShaderPreprocessorDirective = {
  Text: 0,
  IfDef: 1,
  IfNdef: 2,
  IfCmp: 3,
  IfExpr: 4,
  Else: 5,
  Endif: 6,
  Define: 7,
  DefineVal: 8,
  DefineFunc: 9,
  Undef: 10
} as const;

const DIRECTIVE_RE = /^[ \t]*#[ \t]*(if|ifdef|ifndef|elif|else|endif|define|undef)\b(.*)/;
const FUNC_MACRO_RE = /^(\w+)\(([^)]*)\)\s*(.*)/;

/**
 * @internal
 */
export function parseShaderInstructions(glsl: string): ShaderInstruction[] {
  const instructions: ShaderInstruction[] = [];
  const length = glsl.length;
  let pos = 0;
  const backfillStack: number[][] = [];

  while (pos < length) {
    const directiveStart = findDirectiveStart(glsl, pos, length);

    if (directiveStart === -1) {
      pushText(instructions, glsl, pos, length);
      break;
    }

    if (directiveStart > pos) {
      pushText(instructions, glsl, pos, directiveStart);
    }

    let lineEnd = glsl.indexOf("\n", directiveStart);
    if (lineEnd === -1) lineEnd = length;
    const line = glsl.substring(directiveStart, lineEnd);
    pos = lineEnd < length ? lineEnd + 1 : length;

    const match = DIRECTIVE_RE.exec(line);
    if (!match) {
      const last = instructions.length > 0 ? instructions[instructions.length - 1] : null;
      const text = lineEnd < length ? line + "\n" : line;
      if (last && last[0] === ShaderPreprocessorDirective.Text) {
        (last as [number, string])[1] += text;
      } else {
        instructions.push([ShaderPreprocessorDirective.Text, text]);
      }
      continue;
    }

    const keyword = match[1];
    const rest = match[2].trim();

    switch (keyword) {
      case "ifdef": {
        const idx = instructions.length;
        instructions.push([ShaderPreprocessorDirective.IfDef, rest, -1]);
        backfillStack.push([idx]);
        break;
      }
      case "ifndef": {
        const idx = instructions.length;
        instructions.push([ShaderPreprocessorDirective.IfNdef, rest, -1]);
        backfillStack.push([idx]);
        break;
      }
      case "if": {
        const cond = parseConditionString(rest);
        const idx = instructions.length;
        pushConditionInstruction(instructions, cond);
        backfillStack.push([idx]);
        break;
      }
      case "elif": {
        const stack = backfillStack[backfillStack.length - 1];
        const prevIdx = stack[stack.length - 1];
        const elseIdx = instructions.length;
        instructions.push([ShaderPreprocessorDirective.Else, -1]);
        stack.push(elseIdx);
        backfillJump(instructions[prevIdx], instructions.length);

        const cond = parseConditionString(rest);
        const idx = instructions.length;
        pushConditionInstruction(instructions, cond);
        stack.push(idx);
        break;
      }
      case "else": {
        const stack = backfillStack[backfillStack.length - 1];
        const prevIdx = stack[stack.length - 1];
        const elseIdx = instructions.length;
        instructions.push([ShaderPreprocessorDirective.Else, -1]);
        stack.push(elseIdx);
        backfillJump(instructions[prevIdx], instructions.length);
        break;
      }
      case "endif": {
        const endifIdx = instructions.length;
        instructions.push([ShaderPreprocessorDirective.Endif]);
        const stack = backfillStack.pop();
        if (stack) {
          const afterEndif = endifIdx + 1;
          for (let j = 0; j < stack.length; j++) {
            const inst = instructions[stack[j]];
            if (inst[0] === ShaderPreprocessorDirective.Else) {
              (inst as [number, number])[1] = afterEndif;
            } else {
              backfillJump(inst, afterEndif, true);
            }
          }
        }
        break;
      }
      case "define": {
        const funcMatch = FUNC_MACRO_RE.exec(rest);
        if (funcMatch) {
          const params = funcMatch[2]
            .split(",")
            .map((p) => p.trim())
            .filter((p) => p.length > 0);
          instructions.push([
            ShaderPreprocessorDirective.DefineFunc,
            funcMatch[1],
            params,
            stripLineComment(funcMatch[3].trim())
          ]);
        } else {
          const spaceIdx = rest.indexOf(" ");
          if (spaceIdx === -1) {
            instructions.push([ShaderPreprocessorDirective.Define, rest]);
          } else {
            instructions.push([
              ShaderPreprocessorDirective.DefineVal,
              rest.substring(0, spaceIdx),
              stripLineComment(rest.substring(spaceIdx + 1).trim())
            ]);
          }
        }
        break;
      }
      case "undef": {
        instructions.push([ShaderPreprocessorDirective.Undef, rest]);
        break;
      }
    }
  }

  return instructions;
}

/**
 * Push the appropriate condition instruction based on condition type
 */
function pushConditionInstruction(instructions: ShaderInstruction[], cond: Condition): void {
  if (cond.t === "def") {
    instructions.push([ShaderPreprocessorDirective.IfDef, cond.m, -1]);
  } else if (cond.t === "ndef") {
    instructions.push([ShaderPreprocessorDirective.IfNdef, cond.m, -1]);
  } else if (cond.t === "cmp") {
    instructions.push([ShaderPreprocessorDirective.IfCmp, cond.m, cond.op, cond.v, -1]);
  } else {
    instructions.push([ShaderPreprocessorDirective.IfExpr, cond, -1]);
  }
}

/**
 * Find the start of the next preprocessor directive line
 */
function findDirectiveStart(source: string, from: number, length: number): number {
  let i = from;
  while (i < length) {
    let j = i;
    while (j < length) {
      const c = source.charCodeAt(j);
      if (c === 32 /* space */ || c === 9 /* tab */) {
        j++;
      } else {
        break;
      }
    }
    if (j < length && source.charCodeAt(j) === 35 /* '#' */) return i;

    const nl = source.indexOf("\n", i);
    if (nl === -1) break;
    i = nl + 1;
  }
  return -1;
}

/**
 * Append text to instructions, merging with previous Text instruction if possible
 */
function pushText(instructions: ShaderInstruction[], source: string, from: number, to: number): void {
  if (from >= to) return;
  const last = instructions.length > 0 ? instructions[instructions.length - 1] : null;
  if (last && last[0] === ShaderPreprocessorDirective.Text) {
    (last as [number, string])[1] += source.substring(from, to);
  } else {
    instructions.push([ShaderPreprocessorDirective.Text, source.substring(from, to)]);
  }
}

/**
 * Backfill jump offset of an IF/ELIF instruction.
 * When onlyPlaceholder is true, only backfill if the current value is still -1
 */
function backfillJump(inst: ShaderInstruction, target: number, onlyPlaceholder = false): void {
  const directive = inst[0];
  if (directive === ShaderPreprocessorDirective.IfDef || directive === ShaderPreprocessorDirective.IfNdef) {
    if (!onlyPlaceholder || inst[2] === -1) (inst as [number, string, number])[2] = target;
  } else if (directive === ShaderPreprocessorDirective.IfCmp) {
    if (!onlyPlaceholder || inst[4] === -1) (inst as [number, string, string, number, number])[4] = target;
  } else if (directive === ShaderPreprocessorDirective.IfExpr) {
    if (!onlyPlaceholder || inst[2] === -1) (inst as [number, Condition, number])[2] = target;
  }
}

/**
 * Strip trailing // line comment from macro value/body
 */
function stripLineComment(s: string): string {
  const idx = s.indexOf("//");
  return idx >= 0 ? s.substring(0, idx).trimEnd() : s;
}

function parseConditionString(expr: string): Condition {
  const ctx: ExprCtx = { s: expr.trim(), i: 0 };
  return parseOr(ctx);
}

interface ExprCtx {
  s: string;
  i: number;
}

function skipWs(ctx: ExprCtx): void {
  while (ctx.i < ctx.s.length && (ctx.s.charCodeAt(ctx.i) === 32 /* space */ || ctx.s.charCodeAt(ctx.i) === 9 /* tab */))
    ctx.i++;
}

function parseOr(ctx: ExprCtx): Condition {
  let left = parseAnd(ctx);
  skipWs(ctx);
  while (
    ctx.i < ctx.s.length - 1 &&
    ctx.s.charCodeAt(ctx.i) === 124 /* '|' */ &&
    ctx.s.charCodeAt(ctx.i + 1) === 124 /* '|' */
  ) {
    ctx.i += 2;
    skipWs(ctx);
    left = { t: "or", l: left, r: parseAnd(ctx) };
    skipWs(ctx);
  }
  return left;
}

function parseAnd(ctx: ExprCtx): Condition {
  let left = parseUnary(ctx);
  skipWs(ctx);
  while (
    ctx.i < ctx.s.length - 1 &&
    ctx.s.charCodeAt(ctx.i) === 38 /* '&' */ &&
    ctx.s.charCodeAt(ctx.i + 1) === 38 /* '&' */
  ) {
    ctx.i += 2;
    skipWs(ctx);
    left = { t: "and", l: left, r: parseUnary(ctx) };
    skipWs(ctx);
  }
  return left;
}

function parseUnary(ctx: ExprCtx): Condition {
  skipWs(ctx);
  if (ctx.s.charCodeAt(ctx.i) === 33 /* '!' */) {
    ctx.i++;
    skipWs(ctx);
    return { t: "not", c: parsePrimary(ctx) };
  }
  return parsePrimary(ctx);
}

function parsePrimary(ctx: ExprCtx): Condition {
  skipWs(ctx);
  const { s } = ctx;

  // Parenthesized expression
  if (s.charCodeAt(ctx.i) === 40 /* '(' */) {
    ctx.i++;
    skipWs(ctx);
    const inner = parseOr(ctx);
    skipWs(ctx);
    if (s.charCodeAt(ctx.i) === 41 /* ')' */) ctx.i++;
    return inner;
  }

  // defined(MACRO) or defined MACRO
  if (s.substring(ctx.i, ctx.i + 7) === "defined") {
    ctx.i += 7;
    skipWs(ctx);
    const hasParen = s.charCodeAt(ctx.i) === 40 /* '(' */;
    if (hasParen) ctx.i++;
    skipWs(ctx);
    const name = scanIdentifier(ctx);
    skipWs(ctx);
    if (hasParen && s.charCodeAt(ctx.i) === 41 /* ')' */) ctx.i++;
    return { t: "def", m: name };
  }

  // Numeric literal
  if (ctx.i < s.length && isDigit(s.charCodeAt(ctx.i))) {
    const lhsNum = scanNumber(ctx);
    skipWs(ctx);
    const op = scanOp(ctx);
    if (op) {
      skipWs(ctx);
      return { t: "bool", v: evalNumOp(lhsNum, op, scanNumber(ctx)) };
    }
    return { t: "bool", v: lhsNum !== 0 };
  }

  // Identifier — comparison or defined check
  const name = scanIdentifier(ctx);
  if (!name) return { t: "bool", v: false };
  skipWs(ctx);
  const op = scanOp(ctx);
  if (op) {
    skipWs(ctx);
    return { t: "cmp", m: name, op, v: scanNumber(ctx) };
  }
  return { t: "def", m: name };
}

function isDigit(charCode: number): boolean {
  return charCode >= 48 /* '0' */ && charCode <= 57 /* '9' */;
}

function isAlnum(charCode: number): boolean {
  return (
    (charCode >= 65 /* 'A' */ && charCode <= 90 /* 'Z' */) ||
    (charCode >= 97 /* 'a' */ && charCode <= 122 /* 'z' */) ||
    (charCode >= 48 /* '0' */ && charCode <= 57 /* '9' */) ||
    charCode === 95 /* '_' */
  );
}

function scanIdentifier(ctx: ExprCtx): string {
  const start = ctx.i;
  while (ctx.i < ctx.s.length && isAlnum(ctx.s.charCodeAt(ctx.i))) ctx.i++;
  return ctx.s.substring(start, ctx.i);
}

function scanNumber(ctx: ExprCtx): number {
  const start = ctx.i;
  if (ctx.s.charCodeAt(ctx.i) === 45 /* '-' */) ctx.i++;
  while (ctx.i < ctx.s.length && (isDigit(ctx.s.charCodeAt(ctx.i)) || ctx.s.charCodeAt(ctx.i) === 46 /* '.' */))
    ctx.i++;
  return Number(ctx.s.substring(start, ctx.i)) || 0;
}

function scanOp(ctx: ExprCtx): string {
  const c = ctx.s.charCodeAt(ctx.i);
  const c2 = ctx.i + 1 < ctx.s.length ? ctx.s.charCodeAt(ctx.i + 1) : 0;
  if (c === 61 /* '=' */ && c2 === 61 /* '=' */) {
    ctx.i += 2;
    return "==";
  }
  if (c === 33 /* '!' */ && c2 === 61 /* '=' */) {
    ctx.i += 2;
    return "!=";
  }
  if (c === 62 /* '>' */ && c2 === 61 /* '=' */) {
    ctx.i += 2;
    return ">=";
  }
  if (c === 60 /* '<' */ && c2 === 61 /* '=' */) {
    ctx.i += 2;
    return "<=";
  }
  if (c === 62 /* '>' */) {
    ctx.i++;
    return ">";
  }
  if (c === 60 /* '<' */) {
    ctx.i++;
    return "<";
  }
  return "";
}

function evalNumOp(lhs: number, op: string, rhs: number): boolean {
  switch (op) {
    case "==":
      return lhs === rhs;
    case "!=":
      return lhs !== rhs;
    case ">":
      return lhs > rhs;
    case "<":
      return lhs < rhs;
    case ">=":
      return lhs >= rhs;
    case "<=":
      return lhs <= rhs;
    default:
      return false;
  }
}
