import type { Condition, ShaderInstruction } from "@galacean/engine-design";
import { ShaderPreprocessorDirective } from "@galacean/engine-core";

export type { ShaderInstruction } from "@galacean/engine-design";

interface ExprCtx {
  s: string;
  i: number;
}

/**
 * @internal
 */
export class ShaderInstructionEncoder {
  private static _DIRECTIVE_RE = /^[ \t]*#[ \t]*(if|ifdef|ifndef|elif|else|endif|define|undef)\b(.*)/;
  private static _FUNC_MACRO_RE = /^(\w+)\(([^)]*)\)\s*(.*)/;

  static parse(glsl: string): ShaderInstruction[] {
    const instructions: ShaderInstruction[] = [];
    const length = glsl.length;
    let pos = 0;
    const backfillStack: number[][] = [];

    while (pos < length) {
      const directiveStart = ShaderInstructionEncoder._findDirectiveStart(glsl, pos, length);

      if (directiveStart === -1) {
        ShaderInstructionEncoder._pushText(instructions, glsl, pos, length);
        break;
      }

      if (directiveStart > pos) {
        ShaderInstructionEncoder._pushText(instructions, glsl, pos, directiveStart);
      }

      let lineEnd = glsl.indexOf("\n", directiveStart);
      if (lineEnd === -1) lineEnd = length;
      const line = glsl.substring(directiveStart, lineEnd);
      pos = lineEnd < length ? lineEnd + 1 : length;

      const match = ShaderInstructionEncoder._DIRECTIVE_RE.exec(line);
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
          const cond = ShaderInstructionEncoder._parseCondition(rest);
          const idx = instructions.length;
          ShaderInstructionEncoder._pushConditionInstruction(instructions, cond);
          backfillStack.push([idx]);
          break;
        }
        case "elif": {
          const stack = backfillStack[backfillStack.length - 1];
          const prevIdx = stack[stack.length - 1];
          const elseIdx = instructions.length;
          instructions.push([ShaderPreprocessorDirective.Else, -1]);
          stack.push(elseIdx);
          ShaderInstructionEncoder._backfillJump(instructions[prevIdx], instructions.length);

          const cond = ShaderInstructionEncoder._parseCondition(rest);
          const idx = instructions.length;
          ShaderInstructionEncoder._pushConditionInstruction(instructions, cond);
          stack.push(idx);
          break;
        }
        case "else": {
          const stack = backfillStack[backfillStack.length - 1];
          const prevIdx = stack[stack.length - 1];
          const elseIdx = instructions.length;
          instructions.push([ShaderPreprocessorDirective.Else, -1]);
          stack.push(elseIdx);
          ShaderInstructionEncoder._backfillJump(instructions[prevIdx], instructions.length);
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
                ShaderInstructionEncoder._backfillJump(inst, afterEndif, true);
              }
            }
          }
          break;
        }
        case "define": {
          const funcMatch = ShaderInstructionEncoder._FUNC_MACRO_RE.exec(rest);
          if (funcMatch) {
            const params = funcMatch[2]
              .split(",")
              .map((p) => p.trim())
              .filter((p) => p.length > 0);
            instructions.push([
              ShaderPreprocessorDirective.DefineFunc,
              funcMatch[1],
              params,
              ShaderInstructionEncoder._stripLineComment(funcMatch[3].trim())
            ]);
          } else {
            const spaceIdx = rest.indexOf(" ");
            if (spaceIdx === -1) {
              instructions.push([ShaderPreprocessorDirective.Define, rest]);
            } else {
              instructions.push([
                ShaderPreprocessorDirective.DefineVal,
                rest.substring(0, spaceIdx),
                ShaderInstructionEncoder._stripLineComment(rest.substring(spaceIdx + 1).trim())
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

  private static _pushConditionInstruction(instructions: ShaderInstruction[], cond: Condition): void {
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

  private static _findDirectiveStart(source: string, from: number, length: number): number {
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

  private static _pushText(instructions: ShaderInstruction[], source: string, from: number, to: number): void {
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
  private static _backfillJump(inst: ShaderInstruction, target: number, onlyPlaceholder = false): void {
    const directive = inst[0];
    if (directive === ShaderPreprocessorDirective.IfDef || directive === ShaderPreprocessorDirective.IfNdef) {
      if (!onlyPlaceholder || inst[2] === -1) (inst as [number, string, number])[2] = target;
    } else if (directive === ShaderPreprocessorDirective.IfCmp) {
      if (!onlyPlaceholder || inst[4] === -1) (inst as [number, string, string, number, number])[4] = target;
    } else if (directive === ShaderPreprocessorDirective.IfExpr) {
      if (!onlyPlaceholder || inst[2] === -1) (inst as [number, Condition, number])[2] = target;
    }
  }

  private static _stripLineComment(s: string): string {
    const idx = s.indexOf("//");
    return idx >= 0 ? s.substring(0, idx).trimEnd() : s;
  }

  private static _parseCondition(expr: string): Condition {
    const ctx: ExprCtx = { s: expr.trim(), i: 0 };
    const condition = ShaderInstructionEncoder._parseOr(ctx);
    ShaderInstructionEncoder._skipWs(ctx);
    if (ctx.i !== ctx.s.length) throw new Error(`Unsupported or malformed preprocessor condition '${expr}'.`);
    return condition;
  }

  private static _skipWs(ctx: ExprCtx): void {
    while (
      ctx.i < ctx.s.length &&
      (ctx.s.charCodeAt(ctx.i) === 32 /* space */ || ctx.s.charCodeAt(ctx.i) === 9) /* tab */
    )
      ctx.i++;
  }

  private static _parseOr(ctx: ExprCtx): Condition {
    let left = ShaderInstructionEncoder._parseAnd(ctx);
    ShaderInstructionEncoder._skipWs(ctx);
    while (
      ctx.i < ctx.s.length - 1 &&
      ctx.s.charCodeAt(ctx.i) === 124 /* '|' */ &&
      ctx.s.charCodeAt(ctx.i + 1) === 124 /* '|' */
    ) {
      ctx.i += 2;
      ShaderInstructionEncoder._skipWs(ctx);
      left = { t: "or", l: left, r: ShaderInstructionEncoder._parseAnd(ctx) };
      ShaderInstructionEncoder._skipWs(ctx);
    }
    return left;
  }

  private static _parseAnd(ctx: ExprCtx): Condition {
    let left = ShaderInstructionEncoder._parseUnary(ctx);
    ShaderInstructionEncoder._skipWs(ctx);
    while (
      ctx.i < ctx.s.length - 1 &&
      ctx.s.charCodeAt(ctx.i) === 38 /* '&' */ &&
      ctx.s.charCodeAt(ctx.i + 1) === 38 /* '&' */
    ) {
      ctx.i += 2;
      ShaderInstructionEncoder._skipWs(ctx);
      left = { t: "and", l: left, r: ShaderInstructionEncoder._parseUnary(ctx) };
      ShaderInstructionEncoder._skipWs(ctx);
    }
    return left;
  }

  private static _parseUnary(ctx: ExprCtx): Condition {
    ShaderInstructionEncoder._skipWs(ctx);
    if (ctx.s.charCodeAt(ctx.i) === 33 /* '!' */) {
      ctx.i++;
      ShaderInstructionEncoder._skipWs(ctx);
      return { t: "not", c: ShaderInstructionEncoder._parsePrimary(ctx) };
    }
    return ShaderInstructionEncoder._parsePrimary(ctx);
  }

  private static _parsePrimary(ctx: ExprCtx): Condition {
    ShaderInstructionEncoder._skipWs(ctx);
    const { s } = ctx;

    // Parenthesized expression
    if (s.charCodeAt(ctx.i) === 40 /* '(' */) {
      ctx.i++;
      ShaderInstructionEncoder._skipWs(ctx);
      const inner = ShaderInstructionEncoder._parseOr(ctx);
      ShaderInstructionEncoder._skipWs(ctx);
      if (s.charCodeAt(ctx.i) !== 41 /* ')' */)
        throw new Error(`Unsupported or malformed preprocessor condition '${s}'.`);
      ctx.i++;
      return inner;
    }

    // defined(MACRO) or defined MACRO
    if (s.substring(ctx.i, ctx.i + 7) === "defined") {
      ctx.i += 7;
      ShaderInstructionEncoder._skipWs(ctx);
      const hasParen = s.charCodeAt(ctx.i) === 40; /* '(' */
      if (hasParen) ctx.i++;
      ShaderInstructionEncoder._skipWs(ctx);
      const name = ShaderInstructionEncoder._scanIdentifier(ctx);
      if (!name) throw new Error(`Unsupported or malformed preprocessor condition '${s}'.`);
      ShaderInstructionEncoder._skipWs(ctx);
      if (hasParen) {
        if (s.charCodeAt(ctx.i) !== 41 /* ')' */)
          throw new Error(`Unsupported or malformed preprocessor condition '${s}'.`);
        ctx.i++;
      }
      return { t: "def", m: name };
    }

    // Numeric literal
    if (
      ctx.i < s.length &&
      (ShaderInstructionEncoder._isDigit(s.charCodeAt(ctx.i)) ||
        ((s.charCodeAt(ctx.i) === 43 /* '+' */ || s.charCodeAt(ctx.i) === 45) /* '-' */ &&
          ShaderInstructionEncoder._isDigit(s.charCodeAt(ctx.i + 1))))
    ) {
      const lhsNum = ShaderInstructionEncoder._scanNumber(ctx);
      ShaderInstructionEncoder._skipWs(ctx);
      const op = ShaderInstructionEncoder._scanOp(ctx);
      if (op) {
        ShaderInstructionEncoder._skipWs(ctx);
        return {
          t: "bool",
          v: ShaderInstructionEncoder._evalNumOp(lhsNum, op, ShaderInstructionEncoder._scanNumber(ctx))
        };
      }
      return { t: "bool", v: lhsNum !== 0 };
    }

    // Identifier — numeric comparison against zero when no explicit operator is present.
    const name = ShaderInstructionEncoder._scanIdentifier(ctx);
    if (!name) return { t: "bool", v: false };
    ShaderInstructionEncoder._skipWs(ctx);
    const op = ShaderInstructionEncoder._scanOp(ctx);
    if (op) {
      ShaderInstructionEncoder._skipWs(ctx);
      return { t: "cmp", m: name, op, v: ShaderInstructionEncoder._scanNumber(ctx) };
    }
    return { t: "cmp", m: name, op: "!=", v: 0 };
  }

  private static _isDigit(charCode: number): boolean {
    return charCode >= 48 /* '0' */ && charCode <= 57 /* '9' */;
  }

  private static _isAlnum(charCode: number): boolean {
    return (
      (charCode >= 65 /* 'A' */ && charCode <= 90) /* 'Z' */ ||
      (charCode >= 97 /* 'a' */ && charCode <= 122) /* 'z' */ ||
      (charCode >= 48 /* '0' */ && charCode <= 57) /* '9' */ ||
      charCode === 95 /* '_' */
    );
  }

  private static _scanIdentifier(ctx: ExprCtx): string {
    const start = ctx.i;
    while (ctx.i < ctx.s.length && ShaderInstructionEncoder._isAlnum(ctx.s.charCodeAt(ctx.i))) ctx.i++;
    return ctx.s.substring(start, ctx.i);
  }

  private static _scanNumber(ctx: ExprCtx): number {
    const start = ctx.i;
    if (ctx.s.charCodeAt(ctx.i) === 45 /* '-' */) ctx.i++;
    while (
      ctx.i < ctx.s.length &&
      (ShaderInstructionEncoder._isDigit(ctx.s.charCodeAt(ctx.i)) || ctx.s.charCodeAt(ctx.i) === 46) /* '.' */
    )
      ctx.i++;
    return Number(ctx.s.substring(start, ctx.i)) || 0;
  }

  private static _scanOp(ctx: ExprCtx): string {
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

  private static _evalNumOp(lhs: number, op: string, rhs: number): boolean {
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
}
