import { Logger, ShaderPass } from "@galacean/engine";
/** @ts-ignore */
import { ShaderLib } from "@galacean/engine";
import type { ASTNode } from "./parser/AST";

/**
 * Record for a single `#define` directive.
 *
 * Two shapes coexist and can be combined on the same entry:
 *
 * - **Expression macros** — `valueAst` holds an `AssignmentExpression` subtree
 *   produced by the `macro_define` CFG rule. These participate in type
 *   inference, varying flattening, and visitor-based codegen.
 * - **Legacy opaque macros** — the directive is emitted verbatim as a
 *   `MACRO_DEFINE_EXPRESSION` token and expanded by the GLSL driver. `valueAst`
 *   is undefined.
 *
 * `referenceName` captures the top-level external identifier the value refers
 * to, if any — the callee of a function-call value (`#define F foo(a,b)`
 * → `foo`) or the single-identifier value (`#define F foo` → `foo`). Empty
 * for numeric literals, qualifier fragments, or structurally complex values.
 * Populated by the regex pass; drives symbol-table lookup for macro call
 * sites, independent of whether the value also has an AST form.
 */
export interface MacroDefineInfo {
  isFunction: boolean;
  name: string;
  params: string[];
  /** AST for expression-style macros. Absent for opaque macros. */
  valueAst?: ASTNode.AssignmentExpression;
  /** Top-level external identifier the value references, or empty string. */
  referenceName: string;
}

export interface MacroDefineList {
  [macroName: string]: MacroDefineInfo[];
}

export class Preprocessor {
  private static readonly _includeReg = /^[ \t]*#include +"([\w\d./]+)"/gm;
  private static readonly _macroRegex =
    /^\s*#define\s+(\w+)[ ]*(\(([^)]*)\))?[ ]+(\(?\w+\)?.*?)(?:\/\/.*|\/\*.*?\*\/)?\s*$/gm;
  private static readonly _symbolReg = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
  private static readonly _funcCallReg = /^([a-zA-Z_][a-zA-Z0-9_]*)\s*\(.*\)$/;
  private static readonly _macroDefineIncludeMap = new Map<string, MacroDefineList>();

  /**
   * @internal
   */
  static _repeatIncludeSet = new Set<string>();

  static parse(
    source: string,
    basePathForIncludeKey: string,
    outMacroDefineList: MacroDefineList,
    parseMacro = true
  ): string {
    if (parseMacro) {
      this._parseMacroDefines(source, outMacroDefineList);
    }
    return source.replace(this._includeReg, (_, includeName) =>
      this._replace(includeName, basePathForIncludeKey, outMacroDefineList)
    );
  }

  /**
   * For each registered definition of `macroName`, push its `referenceName`
   * (when non-empty and not a macro parameter) so call sites can drive
   * symbol-table lookup.
   */
  static getReferenceSymbolNames(macroDefineList: MacroDefineList, macroName: string, out: string[]): void {
    out.length = 0;
    const infos = macroDefineList[macroName];
    if (!infos) return;

    for (let i = 0, n = infos.length; i < n; i++) {
      const info = infos[i];
      const ref = info.referenceName;
      if (!ref) continue;
      if (info.params.indexOf(ref) !== -1) continue;
      if (out.indexOf(ref) === -1) out.push(ref);
    }
  }

  /**
   * Extract the top-level identifier a value refers to, or empty string if
   * the value is a numeric literal, qualifier fragment, or structurally
   * complex form we don't try to introspect.
   */
  private static _extractReferenceName(value: string): string {
    if (this._symbolReg.test(value)) return value;
    const callMatch = this._funcCallReg.exec(value);
    return callMatch ? callMatch[1] : "";
  }

  private static _isExist(list: MacroDefineInfo[], item: MacroDefineInfo): boolean {
    return list.some(
      (e) =>
        e.isFunction === item.isFunction &&
        e.referenceName === item.referenceName &&
        e.params.length === item.params.length &&
        e.params.every((p, i) => p === item.params[i])
    );
  }

  private static _parseMacroDefines(source: string, outMacroList: MacroDefineList): void {
    let match: RegExpExecArray | null;
    this._macroRegex.lastIndex = 0;

    while ((match = this._macroRegex.exec(source)) !== null) {
      const [, name, paramsGroup, paramsStr, valueRaw] = match;
      const isFunction = !!paramsGroup && !!valueRaw;
      const params =
        isFunction && paramsStr
          ? paramsStr
              .split(",")
              .map((p) => p.trim())
              .filter(Boolean)
          : [];
      const value = valueRaw ? valueRaw.trim() : "";
      const referenceName = value ? this._extractReferenceName(value) : "";

      const info: MacroDefineInfo = { isFunction, name, params, referenceName };

      const arr = outMacroList[name];
      if (arr) {
        if (!this._isExist(arr, info)) arr.push(info);
      } else {
        outMacroList[name] = [info];
      }
    }
  }

  private static _mergeMacroDefineLists(from: MacroDefineList, to: MacroDefineList): void {
    for (const macroName in from) {
      if (to[macroName]) {
        const target = to[macroName];
        const src = from[macroName];
        for (let i = 0; i < src.length; i++) {
          const info = src[i];
          if (!this._isExist(target, info)) target.push(info);
        }
      } else {
        to[macroName] = from[macroName];
      }
    }
  }

  private static _replace(
    includeName: string,
    basePathForIncludeKey: string,
    outMacroDefineList: MacroDefineList
  ): string {
    let path: string;
    if (includeName[0] === ".") {
      // @ts-ignore
      path = new URL(includeName, basePathForIncludeKey).href.substring(ShaderPass._shaderRootPath.length);
    } else {
      path = includeName;
    }

    const chunk = (ShaderLib as any)[path];
    if (!chunk) {
      Logger.error(`Shader slice "${path}" not founded.`);
      return "";
    }

    if (this._repeatIncludeSet.has(path)) {
      Logger.warn(`Shader slice "${path}" is included multiple times.`);
    }
    this._repeatIncludeSet.add(path);

    if (this._macroDefineIncludeMap.has(path)) {
      this._mergeMacroDefineLists(this._macroDefineIncludeMap.get(path)!, outMacroDefineList);
    } else {
      const chunkMacroDefineList: MacroDefineList = {};
      this._parseMacroDefines(chunk, chunkMacroDefineList);
      this._macroDefineIncludeMap.set(path, chunkMacroDefineList);
      this._mergeMacroDefineLists(chunkMacroDefineList, outMacroDefineList);
    }

    return this.parse(chunk, basePathForIncludeKey, outMacroDefineList, false);
  }
}
