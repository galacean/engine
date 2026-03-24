import type { Condition, ShaderInstruction } from "@galacean/engine-design";
import { ShaderPreprocessorDirective } from "./enums/ShaderPreprocessorDirective";

interface FuncMacro {
  params: string[];
  body: string;
}

/**
 * @internal
 */
export class ShaderMacroProcessor {
  private static readonly _maxExpansionDepth = 8;

  /**
   * Evaluate a flat instruction array with active macros.
   * @param instructions - Pre-parsed instruction array
   * @param macros - Active runtime macros { name → value }
   * @returns Pure GLSL string — all conditionals resolved, all macros expanded
   */
  static evaluate(instructions: ShaderInstruction[], macros: Map<string, string>): string {
    const parts: string[] = [];
    const defines = new Map<string, string>();
    const funcMacros = new Map<string, FuncMacro>();
    let pc = 0;
    const len = instructions.length;

    for (const [name, value] of macros) {
      defines.set(name, value);
    }

    while (pc < len) {
      const inst = instructions[pc];
      switch (inst[0]) {
        case ShaderPreprocessorDirective.Text:
          parts.push(inst[1] as string);
          pc++;
          break;
        case ShaderPreprocessorDirective.IfDef:
          pc = defines.has(inst[1] as string) || funcMacros.has(inst[1] as string) ? pc + 1 : (inst[2] as number);
          break;
        case ShaderPreprocessorDirective.IfNdef:
          pc = !defines.has(inst[1] as string) && !funcMacros.has(inst[1] as string) ? pc + 1 : (inst[2] as number);
          break;
        case ShaderPreprocessorDirective.IfCmp: {
          const val = defines.get(inst[1] as string);
          const cond =
            val !== undefined &&
            ShaderMacroProcessor._evalCmpOp(Number(val) || 0, inst[2] as string, inst[3] as number);
          pc = cond ? pc + 1 : (inst[4] as number);
          break;
        }
        case ShaderPreprocessorDirective.IfExpr:
          pc = ShaderMacroProcessor._evalCondition(inst[1] as Condition, defines, funcMacros)
            ? pc + 1
            : (inst[2] as number);
          break;
        case ShaderPreprocessorDirective.Else:
          pc = inst[1] as number;
          break;
        case ShaderPreprocessorDirective.Endif:
          pc++;
          break;
        case ShaderPreprocessorDirective.Define:
          defines.set(inst[1] as string, "");
          pc++;
          break;
        case ShaderPreprocessorDirective.DefineVal:
          defines.set(inst[1] as string, inst[2] as string);
          pc++;
          break;
        case ShaderPreprocessorDirective.DefineFunc:
          funcMacros.set(inst[1] as string, { params: inst[2] as string[], body: inst[3] as string });
          pc++;
          break;
        case ShaderPreprocessorDirective.Undef:
          defines.delete(inst[1] as string);
          funcMacros.delete(inst[1] as string);
          pc++;
          break;
        default:
          pc++;
          break;
      }
    }

    // If no value macros and no function macros, skip expansion
    let hasExpandable = false;
    for (const [, val] of defines) {
      if (val !== "") {
        hasExpandable = true;
        break;
      }
    }
    if (!hasExpandable && funcMacros.size === 0) {
      return parts.join("").replace(/\n\s*\n+/g, "\n");
    }

    return ShaderMacroProcessor._expandMacrosSinglePass(parts, defines, funcMacros);
  }

  private static _evalCmpOp(numVal: number, op: string, value: number): boolean {
    switch (op) {
      case "==":
        return numVal === value;
      case "!=":
        return numVal !== value;
      case ">":
        return numVal > value;
      case "<":
        return numVal < value;
      case ">=":
        return numVal >= value;
      case "<=":
        return numVal <= value;
      default:
        return false;
    }
  }

  private static _evalCondition(
    cond: Condition,
    defines: Map<string, string>,
    funcMacros: Map<string, FuncMacro>
  ): boolean {
    switch (cond.t) {
      case "def":
        return defines.has(cond.m) || funcMacros.has(cond.m);
      case "ndef":
        return !defines.has(cond.m) && !funcMacros.has(cond.m);
      case "cmp": {
        const val = defines.get(cond.m);
        if (val === undefined) return false;
        return ShaderMacroProcessor._evalCmpOp(Number(val) || 0, cond.op, cond.v);
      }
      case "and":
        return (
          ShaderMacroProcessor._evalCondition(cond.l, defines, funcMacros) &&
          ShaderMacroProcessor._evalCondition(cond.r, defines, funcMacros)
        );
      case "or":
        return (
          ShaderMacroProcessor._evalCondition(cond.l, defines, funcMacros) ||
          ShaderMacroProcessor._evalCondition(cond.r, defines, funcMacros)
        );
      case "not":
        return !ShaderMacroProcessor._evalCondition(cond.c, defines, funcMacros);
      case "bool":
        return cond.v;
    }
  }

  // ---- Single-pass token stream macro expansion ----

  /**
   * Scan text parts, expand all macros in a single left-to-right pass.
   * For each character:
   *   - if it starts an identifier → read full identifier → lookup in defines/funcMacros
   *     - if found: expand (substitute value or function body) → recursively expand the result
   *     - if not found: output as-is
   *   - otherwise: output as-is
   *
   * Replaces multiple consecutive newlines with single newline.
   */
  private static _expandMacrosSinglePass(
    parts: string[],
    defines: Map<string, string>,
    funcMacros: Map<string, FuncMacro>
  ): string {
    const text = parts.join("");
    const out: string[] = [];
    const len = text.length;
    let i = 0;
    let lastNewline = false;

    // Build first-char filter: skip Map lookups for identifiers whose first char can't match any macro
    const macroFirstChars = new Set<number>();
    for (const name of defines.keys()) macroFirstChars.add(name.charCodeAt(0));
    for (const name of funcMacros.keys()) macroFirstChars.add(name.charCodeAt(0));

    while (i < len) {
      const cc = text.charCodeAt(i);

      // Identifier start: [a-zA-Z_]
      if ((cc >= 65 && cc <= 90) || (cc >= 97 && cc <= 122) || cc === 95) {
        // Read full identifier
        const start = i;
        i++;
        while (i < len) {
          const c = text.charCodeAt(i);
          if ((c >= 65 && c <= 90) || (c >= 97 && c <= 122) || (c >= 48 && c <= 57) || c === 95) {
            i++;
          } else {
            break;
          }
        }

        // Fast path: first char not in any macro name → skip substring + Map lookups
        if (!macroFirstChars.has(text.charCodeAt(start))) {
          out.push(text.substring(start, i));
          lastNewline = false;
          continue;
        }

        const name = text.substring(start, i);

        // Try function macro
        const func = funcMacros.get(name);
        if (func) {
          // Look ahead for '('
          let p = i;
          while (p < len && (text.charCodeAt(p) === 32 || text.charCodeAt(p) === 9)) p++;
          if (p < len && text.charCodeAt(p) === 40) {
            // Parse arguments
            const args = ShaderMacroProcessor._parseFuncArgs(text, p);
            if (args) {
              i = args.end;
              const expanded = ShaderMacroProcessor._expandFuncBody(func, args.values);
              // Recursively expand the result (handles nested macros, bounded depth)
              const recursed = ShaderMacroProcessor._expandString(expanded, defines, funcMacros, name);
              out.push(recursed);
              lastNewline = false;
              continue;
            }
          }
        }

        // Try value macro
        const val = defines.get(name);
        if (val !== undefined && val !== "" && val !== name) {
          const recursed = ShaderMacroProcessor._expandString(val, defines, funcMacros, name);
          out.push(recursed);
          lastNewline = false;
          continue;
        }

        // Not a macro — output as-is
        out.push(name);
        lastNewline = false;
        continue;
      }

      // Newline compression: collapse \n\s*\n+ into single \n
      if (cc === 10) {
        if (!lastNewline) {
          out.push("\n");
          lastNewline = true;
        }
        i++;
        // Skip whitespace-only lines
        while (i < len) {
          const c = text.charCodeAt(i);
          if (c === 32 || c === 9) {
            i++;
          } else if (c === 10) {
            i++;
          } else {
            break;
          }
        }
        continue;
      }

      // Batch collect consecutive non-identifier, non-newline characters
      const batchStart = i;
      while (i < len) {
        const c = text.charCodeAt(i);
        if ((c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95 || c === 10) break;
        i++;
      }
      out.push(text.substring(batchStart, i));
      lastNewline = false;
    }

    return out.join("");
  }

  /** Parse function macro call arguments: FOO(a, b+c, vec3(1)) → {values: ["a","b+c","vec3(1)"], end: index after ')' } */
  private static _parseFuncArgs(text: string, openParen: number): { values: string[]; end: number } | null {
    const args: string[] = [];
    let level = 1;
    let argStart = openParen + 1;
    let k = argStart;
    const len = text.length;

    while (k < len && level > 0) {
      const cc = text.charCodeAt(k);
      if (cc === 40) {
        level++;
      } else if (cc === 41) {
        if (--level === 0) {
          const arg = text.substring(argStart, k).trim();
          if (arg.length > 0 || args.length > 0) args.push(arg);
          return { values: args, end: k + 1 };
        }
      } else if (cc === 44 && level === 1) {
        args.push(text.substring(argStart, k).trim());
        argStart = k + 1;
      }
      k++;
    }
    return null; // unmatched parentheses
  }

  /** Substitute function macro params in body. */
  private static _expandFuncBody(func: FuncMacro, args: string[]): string {
    if (func.params.length === 0 || args.length !== func.params.length) return func.body;

    let result = func.body;
    for (let i = 0; i < func.params.length; i++) {
      // Replace whole-word occurrences of param with arg value
      result = ShaderMacroProcessor._replaceWord(result, func.params[i], args[i]);
    }
    return result;
  }

  /** Replace all whole-word occurrences of `word` in `text` with `replacement`. No regex. */
  private static _replaceWord(text: string, word: string, replacement: string): string {
    const wLen = word.length;
    const parts: string[] = [];
    let start = 0;
    let idx = text.indexOf(word, start);

    while (idx !== -1) {
      // Check word boundary before
      if (idx > 0) {
        const before = text.charCodeAt(idx - 1);
        if (
          (before >= 65 && before <= 90) ||
          (before >= 97 && before <= 122) ||
          (before >= 48 && before <= 57) ||
          before === 95
        ) {
          idx = text.indexOf(word, idx + 1);
          continue;
        }
      }
      // Check word boundary after
      const afterIdx = idx + wLen;
      if (afterIdx < text.length) {
        const after = text.charCodeAt(afterIdx);
        if (
          (after >= 65 && after <= 90) ||
          (after >= 97 && after <= 122) ||
          (after >= 48 && after <= 57) ||
          after === 95
        ) {
          idx = text.indexOf(word, idx + 1);
          continue;
        }
      }
      // Word boundary match
      parts.push(text.substring(start, idx));
      parts.push(replacement);
      start = afterIdx;
      idx = text.indexOf(word, start);
    }

    if (start === 0) return text; // no matches
    parts.push(text.substring(start));
    return parts.join("");
  }

  /** Recursively expand a small string (macro expansion result). Bounded depth to prevent infinite loops. */
  private static _expandString(
    text: string,
    defines: Map<string, string>,
    funcMacros: Map<string, FuncMacro>,
    excludeName: string,
    depth: number = 0
  ): string {
    if (depth > ShaderMacroProcessor._maxExpansionDepth || text.length === 0) return text;

    const len = text.length;
    const out: string[] = [];
    let i = 0;

    while (i < len) {
      const cc = text.charCodeAt(i);
      if ((cc >= 65 && cc <= 90) || (cc >= 97 && cc <= 122) || cc === 95) {
        const start = i;
        i++;
        while (i < len) {
          const c = text.charCodeAt(i);
          if ((c >= 65 && c <= 90) || (c >= 97 && c <= 122) || (c >= 48 && c <= 57) || c === 95) i++;
          else break;
        }
        const name = text.substring(start, i);

        // Skip self-reference to prevent infinite recursion;
        // skip GL_ prefixed names (reserved GLSL built-ins, never user-defined macros)
        if (
          name === excludeName ||
          (name.charCodeAt(0) === 71 && name.charCodeAt(1) === 76 && name.charCodeAt(2) === 95)
        ) {
          out.push(name);
          continue;
        }

        const func = funcMacros.get(name);
        if (func) {
          let p = i;
          while (p < len && (text.charCodeAt(p) === 32 || text.charCodeAt(p) === 9)) p++;
          if (p < len && text.charCodeAt(p) === 40) {
            const args = ShaderMacroProcessor._parseFuncArgs(text, p);
            if (args) {
              i = args.end;
              out.push(
                ShaderMacroProcessor._expandString(
                  ShaderMacroProcessor._expandFuncBody(func, args.values),
                  defines,
                  funcMacros,
                  name,
                  depth + 1
                )
              );
              continue;
            }
          }
        }

        const val = defines.get(name);
        if (val !== undefined && val !== "" && val !== name) {
          out.push(ShaderMacroProcessor._expandString(val, defines, funcMacros, name, depth + 1));
          continue;
        }

        out.push(name);
        continue;
      }
      // Batch collect consecutive non-identifier characters
      const batchStart = i;
      while (i < len) {
        const c = text.charCodeAt(i);
        if ((c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95) break;
        i++;
      }
      out.push(text.substring(batchStart, i));
    }

    return out.join("");
  }
}
