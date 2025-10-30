import { Logger, ShaderPass } from "@galacean/engine";
/** @ts-ignore */
import { ShaderLib } from "@galacean/engine";

export enum MacroValueType {
  Number, // 1, 1.1
  Symbol, // variable name
  FunctionCall, // function call, e.g. clamp(a, 0.0, 1.0)
  Other // shaderLab does not check this
}

export interface MacroDefineInfo {
  isFunction: boolean;
  name: string;
  value: string;
  valueType: MacroValueType;
  params: string[];
  functionCallName: string;
}

export interface MacroDefineList {
  [macroName: string]: MacroDefineInfo[];
}

export class Preprocessor {
  private static readonly _includeReg = /^[ \t]*#include +"([\w\d./]+)"/gm;
  private static readonly _macroRegex =
    /^\s*#define\s+(\w+)[ ]*(\(([^)]*)\))?[ ]+(\(?\w+\)?.*?)(?:\/\/.*|\/\*.*?\*\/)?\s*$/gm;
  private static readonly _symbolReg = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
  private static readonly _funcCallReg = /^([a-zA-Z_][a-zA-Z0-9_]*)\s*\((.*)\)$/;
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

  static getReferenceSymbolNames(macroDefineList: MacroDefineList, macroName: string, out: string[]): void {
    out.length = 0;
    const infos = macroDefineList[macroName];
    if (!infos) return;

    for (let i = 0; i < infos.length; i++) {
      const info = infos[i];
      const valueType = info.valueType;
      if (valueType === MacroValueType.FunctionCall || valueType === MacroValueType.Symbol) {
        const referencedName = valueType === MacroValueType.FunctionCall ? info.functionCallName : info.value;
        if (info.params.indexOf(referencedName) !== -1) continue;
        if (out.indexOf(referencedName) === -1) out.push(referencedName);
      } else if (valueType === MacroValueType.Other) {
        // #if _VERBOSE
        Logger.warn(
          `Warning: Macro "${info.name}" has an unrecognized value "${info.value}". ShaderLab does not validate this type.`
        );
        // #endif
      }
    }
  }

  private static _isNumber(str: string): boolean {
    return !isNaN(Number(str));
  }

  private static _isExist(list: MacroDefineInfo[], item: MacroDefineInfo): boolean {
    return list.some(
      (e) =>
        e.valueType === item.valueType &&
        e.value === item.value &&
        e.isFunction === item.isFunction &&
        e.functionCallName === item.functionCallName &&
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

      let valueType = MacroValueType.Other;
      let functionCallName = "";

      if (this._isNumber(value)) {
        valueType = MacroValueType.Number;
      } else if (this._symbolReg.test(value)) {
        valueType = MacroValueType.Symbol;
      } else {
        const callMatch = this._funcCallReg.exec(value);
        if (callMatch) {
          valueType = MacroValueType.FunctionCall;
          functionCallName = callMatch[1];
        }
      }

      const info: MacroDefineInfo = {
        isFunction,
        name,
        value,
        valueType,
        params,
        functionCallName
      };

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
