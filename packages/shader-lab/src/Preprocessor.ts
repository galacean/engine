import { Logger, ShaderPass } from "@galacean/engine";
/** @ts-ignore */
import { ShaderLib } from "@galacean/engine";
import type { ASTNode } from "./parser/AST";

/**
 * Record for a single `#define` directive. `valueAst` is set for expression
 * macros (joined into the AST pipeline); opaque macros leave it undefined and
 * are emitted verbatim to the GLSL driver.
 */
export interface MacroDefineInfo {
  isFunction: boolean;
  name: string;
  params: string[];
  valueAst?: ASTNode.AssignmentExpression;
  /** Leading identifier of the value (`#define F foo` → `foo`, `#define F foo(a)`
   *  → `foo`), or empty for literals / operator expressions. Drives symbol-table
   *  lookup at macro call sites. */
  referenceName: string;
}

export interface MacroDefineList {
  [macroName: string]: MacroDefineInfo[];
}

export class Preprocessor {
  private static readonly _includeReg = /^[ \t]*#include +"([\w\d./]+)"/gm;
  private static readonly _macroRegex =
    /^\s*#define\s+(\w+)[ ]*(\(([^)]*)\))?[ ]+(\(?\w+\)?.*?)(?:\/\/.*|\/\*.*?\*\/)?\s*$/gm;
  // Matches a bare identifier or a function-call whole-value form only.
  // Mixed-operator values (`a + b`) are intentionally rejected.
  private static readonly _referenceReg = /^([a-zA-Z_]\w*)(?:\s*\(.*\))?$/;
  private static readonly _chunkCache = new Map<string, { output: string; macros: MacroDefineList }>();

  /**
   * @internal
   */
  static _repeatIncludeSet = new Set<string>();

  static parse(source: string, basePathForIncludeKey: string, outMacroDefineList: MacroDefineList): string {
    this._parseMacroDefines(source, outMacroDefineList);
    return source.replace(this._includeReg, (_, includeName) =>
      this._replace(includeName, basePathForIncludeKey, outMacroDefineList)
    );
  }

  private static _parseMacroDefines(source: string, outMacroList: MacroDefineList): void {
    this._macroRegex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = this._macroRegex.exec(source)) !== null) {
      const [, name, paramsGroup, paramsStr, valueRaw] = match;
      this._registerDefine(outMacroList, name, paramsGroup ? paramsStr : undefined, valueRaw);
    }
  }

  /** Collect unique `referenceName`s of `macroName`'s definitions, skipping
   *  names that shadow a macro parameter. */
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

  private static _extractReferenceName(value: string): string {
    const match = this._referenceReg.exec(value);
    return match ? match[1] : "";
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

  private static _registerDefine(
    outMacroList: MacroDefineList,
    name: string,
    paramsStr: string | undefined,
    valueRaw: string
  ): void {
    // `paramsStr` is `undefined` for object-like macros and the `()` contents
    // (possibly empty) for function-like ones.
    const isFunction = paramsStr !== undefined;
    const params = paramsStr
      ? paramsStr
          .split(",")
          .map((p) => p.trim())
          .filter(Boolean)
      : [];
    const value = valueRaw.trim();
    const referenceName = value ? this._extractReferenceName(value) : "";

    const info: MacroDefineInfo = { isFunction, name, params, referenceName };

    const arr = outMacroList[name];
    if (arr) {
      if (!this._isExist(arr, info)) arr.push(info);
    } else {
      outMacroList[name] = [info];
    }
  }

  private static _mergeMacroDefineLists(from: MacroDefineList, to: MacroDefineList): void {
    for (const name in from) {
      const target = to[name] ?? (to[name] = []);
      const src = from[name];
      for (let i = 0, n = src.length; i < n; i++) {
        const info = src[i];
        if (!this._isExist(target, info)) target.push(info);
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

    let entry = this._chunkCache.get(path);
    if (!entry) {
      const macros: MacroDefineList = {};
      const output = this.parse(chunk, basePathForIncludeKey, macros);
      entry = { output, macros };
      this._chunkCache.set(path, entry);
    }
    this._mergeMacroDefineLists(entry.macros, outMacroDefineList);
    return entry.output;
  }
}
