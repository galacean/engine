import {
  expandPreprocessorExpressionMacros,
  expandShaderMacros,
  evaluatePreprocessorExpression,
  parsePreprocessorExpression,
  resolvePreprocessorDefinedOperators,
  type Condition,
  type ShaderInstruction
} from "@galacean/engine-design";
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
  private static _macroFirstChars = new Set<number>();
  private static _macroFirstCharsDirty = true;
  private static readonly _expressionContext = {
    resolveIdentifier(name: string): number {
      const value = ShaderMacroProcessor._valueMacros.get(name);
      return value === undefined ? 0 : Number(value) | 0;
    },
    isDefined(name: string): boolean {
      return ShaderMacroProcessor._valueMacros.has(name) || ShaderMacroProcessor._funcMacros.has(name);
    }
  };

  /**
   * Evaluate a flat instruction array with active macros.
   * Macros are expanded immediately when text chunks are collected,
   * using the current macro state at that point (conforming to GLSL/C99 §6.10 standard).
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
    ShaderMacroProcessor._macroFirstCharsDirty = true;

    let index = 0;
    const length = instructions.length;

    while (index < length) {
      const instruction = instructions[index];
      switch (instruction[0]) {
        case ShaderPreprocessorDirective.Text:
          // Immediately expand macros using current macro state (GLSL/C99 conformant)
          shaderChunks.push(ShaderMacroProcessor._expandChunk(<string>instruction[1], valueMacros, funcMacros));
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
          const matched =
            val !== undefined &&
            ShaderMacroProcessor._compareValues(Number(val) || 0, <string>instruction[2], <number>instruction[3]);
          index = matched ? index + 1 : <number>instruction[4];
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
          ShaderMacroProcessor._macroFirstCharsDirty = true;
          index++;
          break;
        case ShaderPreprocessorDirective.DefineVal:
          valueMacros.set(<string>instruction[1], <string>instruction[2]);
          ShaderMacroProcessor._macroFirstCharsDirty = true;
          index++;
          break;
        case ShaderPreprocessorDirective.DefineFunc:
          funcMacros.set(<string>instruction[1], { params: <string[]>instruction[2], body: <string>instruction[3] });
          ShaderMacroProcessor._macroFirstCharsDirty = true;
          index++;
          break;
        case ShaderPreprocessorDirective.Undef:
          valueMacros.delete(<string>instruction[1]);
          funcMacros.delete(<string>instruction[1]);
          ShaderMacroProcessor._macroFirstCharsDirty = true;
          index++;
          break;
        default:
          index++;
          break;
      }
    }

    return ShaderMacroProcessor._concatChunks(shaderChunks);
  }

  /**
   * Expand macros in a single text chunk using the current macro state.
   * Returns the chunk as-is if no expandable macros exist.
   */
  private static _expandChunk(
    chunk: string,
    valueMacros: Map<string, string>,
    funcMacros: Map<string, FuncMacro>
  ): string {
    if (funcMacros.size === 0 && valueMacros.size === 0) return chunk;

    if (ShaderMacroProcessor._macroFirstCharsDirty) {
      const macroFirstChars = ShaderMacroProcessor._macroFirstChars;
      macroFirstChars.clear();
      for (const name of valueMacros.keys()) macroFirstChars.add(name.charCodeAt(0));
      for (const name of funcMacros.keys()) macroFirstChars.add(name.charCodeAt(0));
      ShaderMacroProcessor._macroFirstCharsDirty = false;
    }

    // Most chunks contain no active macro names; avoid tokenizing those shader bodies.
    const macroFirstChars = ShaderMacroProcessor._macroFirstChars;
    for (let index = 0; index < chunk.length; ) {
      const char = chunk.charCodeAt(index++);
      if (!ShaderMacroProcessor._isIdentifierStart(char)) continue;
      const start = index - 1;
      while (index < chunk.length && ShaderMacroProcessor._isIdentifierPart(chunk.charCodeAt(index))) index++;
      if (!macroFirstChars.has(char)) continue;
      const name = chunk.slice(start, index);
      if (!valueMacros.has(name) && !funcMacros.has(name)) continue;

      const expanded = expandShaderMacros(chunk, (name) => {
        const func = funcMacros.get(name);
        if (func) return { body: func.body, parameters: func.params };
        const body = valueMacros.get(name);
        return body === undefined ? undefined : { body };
      });
      if (expanded.error) throw new Error(expanded.error);
      return expanded.source;
    }
    return chunk;
  }

  /**
   * Evaluate a compound condition tree.
   */
  private static _evalCondition(
    cond: Condition,
    valueMacros: Map<string, string>,
    funcMacros: Map<string, FuncMacro>
  ): boolean {
    if (cond.t === "deferred") return ShaderMacroProcessor._evalDeferredCondition(cond.e, valueMacros, funcMacros);
    return evaluatePreprocessorExpression(cond, ShaderMacroProcessor._expressionContext) !== 0;
  }

  private static _evalDeferredCondition(
    expression: string,
    valueMacros: Map<string, string>,
    funcMacros: Map<string, FuncMacro>
  ): boolean {
    const withDefinedValues = resolvePreprocessorDefinedOperators(
      expression,
      (name) => valueMacros.has(name) || funcMacros.has(name)
    );
    const expanded = expandPreprocessorExpressionMacros(withDefinedValues, (name) => {
      const func = funcMacros.get(name);
      if (func) return { body: func.body, parameters: func.params };
      const body = valueMacros.get(name);
      return body === undefined ? undefined : { body };
    });
    if (expanded.error) throw new Error(expanded.error);
    const result = parsePreprocessorExpression(expanded.expression);
    if ("error" in result) {
      throw new Error(`Invalid preprocessor expression after macro expansion: ${result.error.message}`);
    }
    return evaluatePreprocessorExpression(result.condition, ShaderMacroProcessor._expressionContext) !== 0;
  }

  private static _compareValues(left: number, operator: string, right: number): boolean {
    left |= 0;
    right |= 0;
    switch (operator) {
      case "==":
        return left === right;
      case "!=":
        return left !== right;
      case ">":
        return left > right;
      case "<":
        return left < right;
      case ">=":
        return left >= right;
      case "<=":
        return left <= right;
      default:
        throw new Error(`Unsupported preprocessor comparison operator '${operator}'.`);
    }
  }

  /**
   * Concatenate shader chunks with consecutive blank lines collapsed to a single newline.
   */
  private static _concatChunks(shaderChunks: string[]): string {
    const out = ShaderMacroProcessor._out;
    out.length = 0;
    let lastNewline = false;

    for (let p = 0; p < shaderChunks.length; p++) {
      const text = shaderChunks[p];
      const len = text.length;
      let i = 0;

      while (i < len) {
        if (text.charCodeAt(i) === 10 /* \n */) {
          if (!lastNewline) {
            out.push("\n");
            lastNewline = true;
          }
          i++;
          while (i < len) {
            const c = text.charCodeAt(i);
            if (c === 32 /* space */ || c === 9 /* tab */ || c === 10 /* \n */) i++;
            else break;
          }
        } else {
          const batchStart = i;
          while (i < len && text.charCodeAt(i) !== 10 /* \n */) i++;
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
