import type { Condition, ShaderInstruction } from "@galacean/engine-design";
import { ShaderPreprocessorDirective } from "@galacean/engine-core";
import { parsePreprocessorCondition } from "@galacean/engine-shader-parser";

export type { ShaderInstruction } from "@galacean/engine-design";

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
          const cond = parsePreprocessorCondition(rest);
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

          const cond = parsePreprocessorCondition(rest);
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
}
