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
  private static _valueMacros = new Map<string, string>();
  private static _funcMacros = new Map<string, FuncMacro>();
  private static _shaderChunks: string[] = [];
  private static _out: string[] = [];
  private static _expandedNames = new Set<string>();
  private static _macroFirstChars = new Set<number>();
  private static _replaceWordParts: string[] = [];
  private static _parsedFuncArgs = { values: [] as string[], end: 0 };

  /**
   * Evaluate a flat instruction array with active macros.
   * @param instructions - Pre-parsed instruction array
   * @param macros - Active runtime macros
   * @returns Pure GLSL string with all conditionals resolved and macros expanded
   */
  static evaluate(instructions: ShaderInstruction[], macros: Map<string, string>): string {
    const valueMacros = ShaderMacroProcessor._valueMacros;
    const funcMacros = ShaderMacroProcessor._funcMacros;
    const shaderChunks = ShaderMacroProcessor._shaderChunks;

    valueMacros.clear();
    funcMacros.clear();
    shaderChunks.length = 0;

    for (const [name, value] of macros) {
      valueMacros.set(name, value);
    }

    let index = 0;
    const length = instructions.length;

    while (index < length) {
      const instruction = instructions[index];
      switch (instruction[0]) {
        case ShaderPreprocessorDirective.Text:
          shaderChunks.push(<string>instruction[1]);
          index++;
          break;
        case ShaderPreprocessorDirective.IfDef: {
          const name = <string>instruction[1];
          index = valueMacros.has(name) || funcMacros.has(name) ? index + 1 : <number>instruction[2];
          break;
        }
        case ShaderPreprocessorDirective.IfNdef: {
          const name = <string>instruction[1];
          index = !valueMacros.has(name) && !funcMacros.has(name) ? index + 1 : <number>instruction[2];
          break;
        }
        case ShaderPreprocessorDirective.IfCmp: {
          const name = <string>instruction[1];
          const val = valueMacros.get(name);
          const cond =
            val !== undefined &&
            ShaderMacroProcessor._evalCmpOp(Number(val) || 0, <string>instruction[2], <number>instruction[3]);
          index = cond ? index + 1 : <number>instruction[4];
          break;
        }
        case ShaderPreprocessorDirective.IfExpr:
          index = ShaderMacroProcessor._evalCondition(<Condition>instruction[1], valueMacros, funcMacros)
            ? index + 1
            : <number>instruction[2];
          break;
        case ShaderPreprocessorDirective.Else:
          index = <number>instruction[1];
          break;
        case ShaderPreprocessorDirective.Endif:
          index++;
          break;
        case ShaderPreprocessorDirective.Define:
          valueMacros.set(<string>instruction[1], "");
          index++;
          break;
        case ShaderPreprocessorDirective.DefineVal:
          valueMacros.set(<string>instruction[1], <string>instruction[2]);
          index++;
          break;
        case ShaderPreprocessorDirective.DefineFunc:
          funcMacros.set(<string>instruction[1], { params: <string[]>instruction[2], body: <string>instruction[3] });
          index++;
          break;
        case ShaderPreprocessorDirective.Undef:
          valueMacros.delete(<string>instruction[1]);
          funcMacros.delete(<string>instruction[1]);
          index++;
          break;
        default:
          index++;
          break;
      }
    }

    // Fast path: no expandable macros
    let hasExpandable = false;
    for (const [, val] of valueMacros) {
      if (val !== "") {
        hasExpandable = true;
        break;
      }
    }
    if (!hasExpandable && funcMacros.size === 0) {
      return ShaderMacroProcessor._joinAndCompressNewlines(shaderChunks);
    }

    return ShaderMacroProcessor._expandMacros(shaderChunks, valueMacros, funcMacros);
  }

  /**
   * Scan shader chunks, expand all macros in a left-to-right pass.
   */
  private static _expandMacros(
    shaderChunks: string[],
    valueMacros: Map<string, string>,
    funcMacros: Map<string, FuncMacro>
  ): string {
    const shaderSource = shaderChunks.join("");
    const out = ShaderMacroProcessor._out;
    out.length = 0;
    const len = shaderSource.length;
    let i = 0;
    let lastNewline = false;

    const macroFirstChars = ShaderMacroProcessor._macroFirstChars;
    macroFirstChars.clear();
    for (const name of valueMacros.keys()) macroFirstChars.add(name.charCodeAt(0));
    for (const name of funcMacros.keys()) macroFirstChars.add(name.charCodeAt(0));

    const expandedNames = ShaderMacroProcessor._expandedNames;

    while (i < len) {
      const cc = shaderSource.charCodeAt(i);

      if (ShaderMacroProcessor._isIdentifierStart(cc)) {
        const start = i;
        i++;
        while (i < len && ShaderMacroProcessor._isIdentifierPart(shaderSource.charCodeAt(i))) i++;

        // Fast path: first char not in any macro name
        if (!macroFirstChars.has(shaderSource.charCodeAt(start))) {
          out.push(shaderSource.substring(start, i));
          lastNewline = false;
          continue;
        }

        const name = shaderSource.substring(start, i);

        // Try function macro
        const func = funcMacros.get(name);
        if (func) {
          let lookAhead = i;
          while (lookAhead < len && (shaderSource.charCodeAt(lookAhead) === 32 || shaderSource.charCodeAt(lookAhead) === 9)) lookAhead++;
          if (lookAhead < len && shaderSource.charCodeAt(lookAhead) === 40) {
            const args = ShaderMacroProcessor._parseFuncArgs(shaderSource, lookAhead);
            if (args) {
              i = args.end;
              const expanded = ShaderMacroProcessor._expandFuncBody(func, args.values);
              expandedNames.clear();
              expandedNames.add(name);
              out.push(ShaderMacroProcessor._recursiveExpandMacro(expanded, valueMacros, funcMacros, expandedNames));
              lastNewline = false;
              continue;
            }
          }
        }

        // Try value macro
        const val = valueMacros.get(name);
        if (val !== undefined && val !== "") {
          expandedNames.clear();
          expandedNames.add(name);
          out.push(ShaderMacroProcessor._recursiveExpandMacro(val, valueMacros, funcMacros, expandedNames));
          lastNewline = false;
          continue;
        }

        out.push(name);
        lastNewline = false;
        continue;
      }

      // Newline compression
      if (cc === 10) {
        if (!lastNewline) {
          out.push("\n");
          lastNewline = true;
        }
        i++;
        while (i < len) {
          const c = shaderSource.charCodeAt(i);
          if (c === 32 || c === 9 || c === 10) i++;
          else break;
        }
        continue;
      }

      // Batch collect non-identifier, non-newline characters
      const batchStart = i;
      while (i < len) {
        const c = shaderSource.charCodeAt(i);
        if (ShaderMacroProcessor._isIdentifierStart(c) || c === 10) break;
        i++;
      }
      out.push(shaderSource.substring(batchStart, i));
      lastNewline = false;
    }

    return out.join("");
  }

  /**
   * Recursively expand macro substitution results until no more macros remain.
   * @param macroExpansion - Intermediate text from a macro substitution that may contain further macro references
   * @param valueMacros - Current value macro definitions
   * @param funcMacros - Current function macro definitions
   * @param expandedNames - Macro names already on the expansion chain, prevents circular references (C99 §6.10.3.4)
   */
  private static _recursiveExpandMacro(
    macroExpansion: string,
    valueMacros: Map<string, string>,
    funcMacros: Map<string, FuncMacro>,
    expandedNames: Set<string>
  ): string {
    if (macroExpansion.length === 0) return macroExpansion;

    const len = macroExpansion.length;
    const out: string[] = [];
    let i = 0;

    while (i < len) {
      const cc = macroExpansion.charCodeAt(i);
      if (ShaderMacroProcessor._isIdentifierStart(cc)) {
        const start = i;
        i++;
        while (i < len && ShaderMacroProcessor._isIdentifierPart(macroExpansion.charCodeAt(i))) i++;
        const name = macroExpansion.substring(start, i);

        // Skip already-expanded names (circular reference prevention)
        // Skip GL_ prefixed names (reserved GLSL built-ins, charCodes: G=71, L=76, _=95)
        if (
          expandedNames.has(name) ||
          (name.charCodeAt(0) === 71 && name.charCodeAt(1) === 76 && name.charCodeAt(2) === 95)
        ) {
          out.push(name);
          continue;
        }

        const func = funcMacros.get(name);
        if (func) {
          let lookAhead = i;
          while (lookAhead < len && (macroExpansion.charCodeAt(lookAhead) === 32 || macroExpansion.charCodeAt(lookAhead) === 9))
            lookAhead++;
          if (lookAhead < len && macroExpansion.charCodeAt(lookAhead) === 40) {
            const args = ShaderMacroProcessor._parseFuncArgs(macroExpansion, lookAhead);
            if (args) {
              i = args.end;
              expandedNames.add(name);
              out.push(
                ShaderMacroProcessor._recursiveExpandMacro(
                  ShaderMacroProcessor._expandFuncBody(func, args.values),
                  valueMacros,
                  funcMacros,
                  expandedNames
                )
              );
              expandedNames.delete(name);
              continue;
            }
          }
        }

        const val = valueMacros.get(name);
        if (val !== undefined && val !== "") {
          expandedNames.add(name);
          out.push(ShaderMacroProcessor._recursiveExpandMacro(val, valueMacros, funcMacros, expandedNames));
          expandedNames.delete(name);
          continue;
        }

        out.push(name);
        continue;
      }

      // Batch collect non-identifier characters
      const batchStart = i;
      while (i < len && !ShaderMacroProcessor._isIdentifierStart(macroExpansion.charCodeAt(i))) i++;
      out.push(macroExpansion.substring(batchStart, i));
    }

    return out.join("");
  }

  /**
   * Substitute function macro params in body.
   */
  private static _expandFuncBody(func: FuncMacro, args: string[]): string {
    if (func.params.length === 0 || args.length !== func.params.length) return func.body;

    let result = func.body;
    for (let i = 0; i < func.params.length; i++) {
      result = ShaderMacroProcessor._replaceWord(result, func.params[i], args[i]);
    }
    return result;
  }

  /**
   * Evaluate a compound condition tree.
   */
  private static _evalCondition(
    cond: Condition,
    valueMacros: Map<string, string>,
    funcMacros: Map<string, FuncMacro>
  ): boolean {
    switch (cond.t) {
      case "def":
        return valueMacros.has(cond.m) || funcMacros.has(cond.m);
      case "ndef":
        return !valueMacros.has(cond.m) && !funcMacros.has(cond.m);
      case "cmp": {
        const val = valueMacros.get(cond.m);
        if (val === undefined) return false;
        return ShaderMacroProcessor._evalCmpOp(Number(val) || 0, cond.op, cond.v);
      }
      case "and":
        return (
          ShaderMacroProcessor._evalCondition(cond.l, valueMacros, funcMacros) &&
          ShaderMacroProcessor._evalCondition(cond.r, valueMacros, funcMacros)
        );
      case "or":
        return (
          ShaderMacroProcessor._evalCondition(cond.l, valueMacros, funcMacros) ||
          ShaderMacroProcessor._evalCondition(cond.r, valueMacros, funcMacros)
        );
      case "not":
        return !ShaderMacroProcessor._evalCondition(cond.c, valueMacros, funcMacros);
      case "bool":
        return cond.v;
    }
  }

  /**
   * Evaluate a comparison operator.
   */
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

  /**
   * Parse function macro call arguments.
   * Returns reusable static result object to avoid allocation.
   */
  private static _parseFuncArgs(text: string, openParen: number): { values: string[]; end: number } | null {
    const result = ShaderMacroProcessor._parsedFuncArgs;
    result.values.length = 0;
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
          if (arg.length > 0 || result.values.length > 0) result.values.push(arg);
          result.end = k + 1;
          return result;
        }
      } else if (cc === 44 && level === 1) {
        result.values.push(text.substring(argStart, k).trim());
        argStart = k + 1;
      }
      k++;
    }
    return null;
  }

  /**
   * Replace all whole-word occurrences of `word` in `text` with `replacement`.
   */
  private static _replaceWord(text: string, word: string, replacement: string): string {
    const wLen = word.length;
    const parts = ShaderMacroProcessor._replaceWordParts;
    parts.length = 0;
    let start = 0;
    let idx = text.indexOf(word, start);

    while (idx !== -1) {
      if (idx > 0 && ShaderMacroProcessor._isIdentifierPart(text.charCodeAt(idx - 1))) {
        idx = text.indexOf(word, idx + 1);
        continue;
      }
      const afterIdx = idx + wLen;
      if (afterIdx < text.length && ShaderMacroProcessor._isIdentifierPart(text.charCodeAt(afterIdx))) {
        idx = text.indexOf(word, idx + 1);
        continue;
      }
      parts.push(text.substring(start, idx));
      parts.push(replacement);
      start = afterIdx;
      idx = text.indexOf(word, start);
    }

    if (start === 0) return text;
    parts.push(text.substring(start));
    return parts.join("");
  }

  /**
   * Join shader chunks with consecutive empty lines collapsed to single newline.
   */
  private static _joinAndCompressNewlines(shaderChunks: string[]): string {
    const out = ShaderMacroProcessor._out;
    out.length = 0;
    let lastNewline = false;

    for (let p = 0; p < shaderChunks.length; p++) {
      const text = shaderChunks[p];
      const len = text.length;
      let i = 0;

      while (i < len) {
        if (text.charCodeAt(i) === 10) {
          if (!lastNewline) {
            out.push("\n");
            lastNewline = true;
          }
          i++;
          while (i < len) {
            const c = text.charCodeAt(i);
            if (c === 32 || c === 9 || c === 10) i++;
            else break;
          }
        } else {
          const batchStart = i;
          while (i < len && text.charCodeAt(i) !== 10) i++;
          out.push(text.substring(batchStart, i));
          lastNewline = false;
        }
      }
    }

    return out.join("");
  }

  /**
   * Check if char code is a valid identifier start.
   * Matches: [A-Z] | [a-z] | _
   */
  private static _isIdentifierStart(charCode: number): boolean {
    return (charCode >= 65 && charCode <= 90) || (charCode >= 97 && charCode <= 122) || charCode === 95;
  }

  /**
   * Check if char code is a valid identifier part.
   * Matches: [A-Z] | [a-z] | [0-9] | _
   */
  private static _isIdentifierPart(charCode: number): boolean {
    return (
      (charCode >= 65 && charCode <= 90) ||
      (charCode >= 97 && charCode <= 122) ||
      (charCode >= 48 && charCode <= 57) ||
      charCode === 95
    );
  }
}
