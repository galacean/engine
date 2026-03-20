/**
 * Build-time GLSL preprocessor instruction parser.
 *
 * Parses CodeGen GLSL output (containing #if/#ifdef/#ifndef/#elif/#else/#endif/#define/#undef)
 * into a flat instruction array. Conditional branching uses jump offsets.
 * The instruction array is serialized to .gsp for runtime evaluation by InstructionDecoder.
 */

import type { Condition, Instruction } from "@galacean/engine-design";

export type { Instruction } from "@galacean/engine-design";

/**
 * Opcode constants for the flat instruction array.
 *
 * Each instruction is `[opcode, ...operands]`. Layout per opcode:
 *
 *   0  TEXT         [0, content: string]                              output text fragment
 *   1  IF_DEF       [1, macroName: string, jumpOffset: number]        #ifdef — jump if NOT defined
 *   2  IF_NDEF      [2, macroName: string, jumpOffset: number]        #ifndef — jump if IS defined
 *   3  IF_CMP       [3, name: string, op: string, val: number, jump: number]  #if MACRO op value
 *   4  IF_EXPR      [4, condition: Condition, jumpOffset: number]     #if compound (&&/||/!)
 *   5  ELSE         [5, jumpOffset: number]                           unconditional jump past #endif
 *   6  ENDIF        [6]                                               end of conditional block
 *   7  DEFINE       [7, name: string]                                 #define NAME
 *   8  DEFINE_VAL   [8, name: string, value: string]                  #define NAME value
 *   9  DEFINE_FUNC  [9, name: string, params: string[], body: string] #define NAME(a,b) body
 *  10  UNDEF        [10, name: string]                                #undef NAME
 *
 * #elif is decomposed into ELSE + IF_xxx (see explanation below).
 */
const Op = {
  TEXT: 0,
  IF_DEF: 1,
  IF_NDEF: 2,
  IF_CMP: 3,
  IF_EXPR: 4,
  ELSE: 5,
  ENDIF: 6,
  DEFINE: 7,
  DEFINE_VAL: 8,
  DEFINE_FUNC: 9,
  UNDEF: 10
} as const;

// ---- Pre-compiled regexes (hoisted for performance) ----

const DIRECTIVE_RE = /^[ \t]*#[ \t]*(if|ifdef|ifndef|elif|else|endif|define|undef)\b(.*)/;
const FUNC_MACRO_RE = /^(\w+)\(([^)]*)\)\s*(.*)/;

/**
 * Parse a GLSL string (CodeGen output) into a flat instruction array.
 * Called at build time during _precompile() and _parseShaderPass().
 */
export function parseInstructions(glsl: string): Instruction[] {
  const instructions: Instruction[] = [];
  const len = glsl.length;
  let pos = 0;
  const backfillStack: number[][] = [];

  while (pos < len) {
    // Find next line starting with # (preprocessor directive)
    const directiveStart = findDirectiveStart(glsl, pos, len);

    if (directiveStart === -1) {
      pushText(instructions, glsl, pos, len);
      break;
    }

    // Text before directive
    if (directiveStart > pos) {
      pushText(instructions, glsl, pos, directiveStart);
    }

    // Find end of directive line
    let lineEnd = glsl.indexOf("\n", directiveStart);
    if (lineEnd === -1) lineEnd = len;
    const line = glsl.substring(directiveStart, lineEnd);
    pos = lineEnd < len ? lineEnd + 1 : len;

    const match = DIRECTIVE_RE.exec(line);
    if (!match) {
      // Not a recognized directive — treat as text
      const last = instructions.length > 0 ? instructions[instructions.length - 1] : null;
      const text = lineEnd < len ? line + "\n" : line;
      if (last && last[0] === Op.TEXT) {
        (last as [number, string])[1] += text;
      } else {
        instructions.push([Op.TEXT, text]);
      }
      continue;
    }

    const keyword = match[1];
    const rest = match[2].trim();

    switch (keyword) {
      case "ifdef": {
        const idx = instructions.length;
        instructions.push([Op.IF_DEF, rest, -1]);
        backfillStack.push([idx]);
        break;
      }
      case "ifndef": {
        const idx = instructions.length;
        instructions.push([Op.IF_NDEF, rest, -1]);
        backfillStack.push([idx]);
        break;
      }
      case "if": {
        const cond = parseConditionString(rest);
        const idx = instructions.length;
        if (cond.t === "def") {
          instructions.push([Op.IF_DEF, cond.m, -1]);
        } else if (cond.t === "ndef") {
          instructions.push([Op.IF_NDEF, cond.m, -1]);
        } else if (cond.t === "cmp") {
          instructions.push([Op.IF_CMP, cond.m, cond.op, cond.v, -1]);
        } else {
          instructions.push([Op.IF_EXPR, cond, -1]);
        }
        backfillStack.push([idx]);
        break;
      }
      case "elif": {
        const stack = backfillStack[backfillStack.length - 1];
        const prevIdx = stack[stack.length - 1];
        const elseIdx = instructions.length;
        instructions.push([Op.ELSE, -1]);
        stack.push(elseIdx);
        backfillJump(instructions[prevIdx], instructions.length);

        const cond = parseConditionString(rest);
        const idx = instructions.length;
        if (cond.t === "def") {
          instructions.push([Op.IF_DEF, cond.m, -1]);
        } else if (cond.t === "ndef") {
          instructions.push([Op.IF_NDEF, cond.m, -1]);
        } else if (cond.t === "cmp") {
          instructions.push([Op.IF_CMP, cond.m, cond.op, cond.v, -1]);
        } else {
          instructions.push([Op.IF_EXPR, cond, -1]);
        }
        stack.push(idx);
        break;
      }
      case "else": {
        const stack = backfillStack[backfillStack.length - 1];
        const prevIdx = stack[stack.length - 1];
        const elseIdx = instructions.length;
        instructions.push([Op.ELSE, -1]);
        stack.push(elseIdx);
        backfillJump(instructions[prevIdx], instructions.length);
        break;
      }
      case "endif": {
        const endifIdx = instructions.length;
        instructions.push([Op.ENDIF]);
        const stack = backfillStack.pop();
        if (stack) {
          const afterEndif = endifIdx + 1;
          for (let j = 0; j < stack.length; j++) {
            const inst = instructions[stack[j]];
            if (inst[0] === Op.ELSE) {
              (inst as [number, number])[1] = afterEndif;
            } else {
              backfillJumpIfNeeded(inst, afterEndif);
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
          instructions.push([Op.DEFINE_FUNC, funcMatch[1], params, stripLineComment(funcMatch[3].trim())]);
        } else {
          const spaceIdx = rest.indexOf(" ");
          if (spaceIdx === -1) {
            instructions.push([Op.DEFINE, rest]);
          } else {
            instructions.push([
              Op.DEFINE_VAL,
              rest.substring(0, spaceIdx),
              stripLineComment(rest.substring(spaceIdx + 1).trim())
            ]);
          }
        }
        break;
      }
      case "undef": {
        instructions.push([Op.UNDEF, rest]);
        break;
      }
    }
  }

  return instructions;
}

// ---- Helpers ----

/** Find the start of the next preprocessor directive line (line beginning with optional whitespace + #). */
function findDirectiveStart(source: string, from: number, len: number): number {
  let i = from;
  while (i < len) {
    // At line start: skip whitespace, check for #
    let j = i;
    while (j < len) {
      const c = source.charCodeAt(j);
      if (c === 32 || c === 9) {
        j++;
      } else {
        break;
      }
    }
    if (j < len && source.charCodeAt(j) === 35) return i; // 35 = '#'

    // Advance to next line
    const nl = source.indexOf("\n", i);
    if (nl === -1) break;
    i = nl + 1;
  }
  return -1;
}

/** Append text to instructions, merging with previous TEXT if possible. */
function pushText(instructions: Instruction[], source: string, from: number, to: number): void {
  if (from >= to) return;
  const last = instructions.length > 0 ? instructions[instructions.length - 1] : null;
  if (last && last[0] === Op.TEXT) {
    (last as [number, string])[1] += source.substring(from, to);
  } else {
    instructions.push([Op.TEXT, source.substring(from, to)]);
  }
}

/** Backfill jump offset of an IF/ELIF instruction. */
function backfillJump(inst: Instruction, target: number): void {
  const op = inst[0];
  if (op === Op.IF_DEF || op === Op.IF_NDEF) {
    (inst as [number, string, number])[2] = target;
  } else if (op === Op.IF_CMP) {
    (inst as [number, string, string, number, number])[4] = target;
  } else if (op === Op.IF_EXPR) {
    (inst as [number, Condition, number])[2] = target;
  }
}

/** Backfill only if still at placeholder -1. */
function backfillJumpIfNeeded(inst: Instruction, target: number): void {
  const op = inst[0];
  if (op === Op.IF_DEF || op === Op.IF_NDEF) {
    if (inst[2] === -1) (inst as [number, string, number])[2] = target;
  } else if (op === Op.IF_CMP) {
    if (inst[4] === -1) (inst as [number, string, string, number, number])[4] = target;
  } else if (op === Op.IF_EXPR) {
    if (inst[2] === -1) (inst as [number, Condition, number])[2] = target;
  }
}

/** Strip trailing // line comment from macro value/body. */
function stripLineComment(s: string): string {
  const idx = s.indexOf("//");
  return idx >= 0 ? s.substring(0, idx).trimEnd() : s;
}

// ---- Condition expression parser ----

function parseConditionString(expr: string): Condition {
  const ctx: ExprCtx = { s: expr.trim(), i: 0 };
  return parseOr(ctx);
}

interface ExprCtx {
  s: string;
  i: number;
}

function skipWs(ctx: ExprCtx): void {
  while (ctx.i < ctx.s.length && (ctx.s.charCodeAt(ctx.i) === 32 || ctx.s.charCodeAt(ctx.i) === 9)) ctx.i++;
}

function parseOr(ctx: ExprCtx): Condition {
  let left = parseAnd(ctx);
  skipWs(ctx);
  while (ctx.i < ctx.s.length - 1 && ctx.s.charCodeAt(ctx.i) === 124 && ctx.s.charCodeAt(ctx.i + 1) === 124) {
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
  while (ctx.i < ctx.s.length - 1 && ctx.s.charCodeAt(ctx.i) === 38 && ctx.s.charCodeAt(ctx.i + 1) === 38) {
    ctx.i += 2;
    skipWs(ctx);
    left = { t: "and", l: left, r: parseUnary(ctx) };
    skipWs(ctx);
  }
  return left;
}

function parseUnary(ctx: ExprCtx): Condition {
  skipWs(ctx);
  if (ctx.s.charCodeAt(ctx.i) === 33) {
    // '!'
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
  if (s.charCodeAt(ctx.i) === 40) {
    // '('
    ctx.i++;
    skipWs(ctx);
    const inner = parseOr(ctx);
    skipWs(ctx);
    if (s.charCodeAt(ctx.i) === 41) ctx.i++; // ')'
    return inner;
  }

  // defined(MACRO) or defined MACRO
  if (s.substring(ctx.i, ctx.i + 7) === "defined") {
    ctx.i += 7;
    skipWs(ctx);
    const hasParen = s.charCodeAt(ctx.i) === 40;
    if (hasParen) ctx.i++;
    skipWs(ctx);
    const name = scanIdentifier(ctx);
    skipWs(ctx);
    if (hasParen && s.charCodeAt(ctx.i) === 41) ctx.i++;
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

function isDigit(cc: number): boolean {
  return cc >= 48 && cc <= 57;
}

function isAlnum(cc: number): boolean {
  return (cc >= 65 && cc <= 90) || (cc >= 97 && cc <= 122) || (cc >= 48 && cc <= 57) || cc === 95;
}

function scanIdentifier(ctx: ExprCtx): string {
  const start = ctx.i;
  while (ctx.i < ctx.s.length && isAlnum(ctx.s.charCodeAt(ctx.i))) ctx.i++;
  return ctx.s.substring(start, ctx.i);
}

function scanNumber(ctx: ExprCtx): number {
  const start = ctx.i;
  if (ctx.s.charCodeAt(ctx.i) === 45) ctx.i++; // '-'
  while (ctx.i < ctx.s.length && (isDigit(ctx.s.charCodeAt(ctx.i)) || ctx.s.charCodeAt(ctx.i) === 46)) ctx.i++;
  return Number(ctx.s.substring(start, ctx.i)) || 0;
}

function scanOp(ctx: ExprCtx): string {
  const c = ctx.s.charCodeAt(ctx.i);
  const c2 = ctx.i + 1 < ctx.s.length ? ctx.s.charCodeAt(ctx.i + 1) : 0;
  if (c === 61 && c2 === 61) {
    ctx.i += 2;
    return "==";
  }
  if (c === 33 && c2 === 61) {
    ctx.i += 2;
    return "!=";
  }
  if (c === 62 && c2 === 61) {
    ctx.i += 2;
    return ">=";
  }
  if (c === 60 && c2 === 61) {
    ctx.i += 2;
    return "<=";
  }
  if (c === 62) {
    ctx.i++;
    return ">";
  }
  if (c === 60) {
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
