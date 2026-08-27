import type { Condition, PreprocessorExpressionParseResult, ShaderInstruction } from "@galacean/engine-design";
import { ShaderPreprocessorDirective } from "@galacean/engine-core";
import { parsePreprocessorExpression, toPreprocessorCondition } from "@galacean/engine-shader-parser/internal";

export type { ShaderInstruction } from "@galacean/engine-design";

/**
 * @internal
 */
export class ShaderInstructionEncoder {
  private static _DIRECTIVE_RE = /^[ \t]*#[ \t]*(if|ifdef|ifndef|elif|else|endif|define|undef)\b(.*)/;
  private static _FUNC_MACRO_RE = /^(\w+)\(([^)]*)\)\s*(.*)/;

  /**
   * Encodes generated GLSL directives into runtime-selectable instructions.
   * @param glsl - Generated stage source.
   * @param preprocessorExpressions - Parser-owned expression trees keyed by logical directive text.
   * @returns Runtime shader instruction stream.
   * @throws Error when a conditional directive is malformed or has a deterministic evaluation failure.
   * @internal
   */
  static parse(
    glsl: string,
    preprocessorExpressions?: ReadonlyMap<string, PreprocessorExpressionParseResult>
  ): ShaderInstruction[] {
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

      const lineEnd = ShaderInstructionEncoder._findLogicalLineEnd(glsl, directiveStart, length);
      const line = glsl.substring(directiveStart, lineEnd).replace(/\\(?:\r\n|\n|\r)/g, " ");
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
          const cond = ShaderInstructionEncoder._parseCondition(rest, preprocessorExpressions);
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

          const cond = ShaderInstructionEncoder._parseCondition(rest, preprocessorExpressions);
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
            const separator = ShaderInstructionEncoder._findInlineWhitespace(rest);
            if (separator === rest.length) {
              instructions.push([ShaderPreprocessorDirective.Define, rest]);
            } else {
              instructions.push([
                ShaderPreprocessorDirective.DefineVal,
                rest.substring(0, separator),
                ShaderInstructionEncoder._stripLineComment(rest.substring(separator + 1).trim())
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

  private static _parseCondition(
    expression: string,
    preprocessorExpressions?: ReadonlyMap<string, PreprocessorExpressionParseResult>
  ): Condition {
    const result = preprocessorExpressions?.get(expression) ?? parsePreprocessorExpression(expression);
    if ("error" in result) {
      if (!result.error.certain && result.hasExpandableIdentifier) return { t: "deferred", e: expression };
      throw new Error(result.error.message);
    }
    if (result.evaluationError) throw new Error(result.evaluationError);
    const compact = toPreprocessorCondition(result.condition);
    if (compact && !result.hasExpandableIdentifier) return compact;
    return result.hasExpandableIdentifier ? { t: "deferred", e: expression } : result.condition;
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

  private static _findLogicalLineEnd(source: string, start: number, length: number): number {
    let lineEnd = source.indexOf("\n", start);
    while (lineEnd !== -1) {
      const beforeBreak = source.charCodeAt(lineEnd - 1) === 13 ? lineEnd - 2 : lineEnd - 1;
      if (beforeBreak < start || source.charCodeAt(beforeBreak) !== 92) return lineEnd;
      lineEnd = source.indexOf("\n", lineEnd + 1);
    }
    return length;
  }

  private static _findInlineWhitespace(source: string): number {
    let index = 0;
    while (index < source.length) {
      const charCode = source.charCodeAt(index);
      if (charCode === 32 /* space */ || charCode === 9 /* tab */) break;
      index++;
    }
    return index;
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
}
