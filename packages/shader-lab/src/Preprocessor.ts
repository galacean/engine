import { Logger, ShaderPass } from "@galacean/engine";

/** @ts-ignore */
import { ShaderLib } from "@galacean/engine";

export enum MacroValueType {
  Number, // 1, 1.1
  Symbol, // variable name
  FunctionCall, // function call, e.g. clamp(a, 0.0, 1.0), need to collect function call info
  Other // shaderLab does not check this, e.g. a + b, cannot enumerate all cases, just give a warning!
}

export interface MacroDefineInfo {
  isFunction: boolean; // whether the macro itself is a function macro
  name: string; // macro name
  value: string; // macro expanded string value
  valueType: MacroValueType; // type of value
  params: string[]; // only present when isFunction is true, collect incoming parameters
  functionCallName: string; // only present when valueType is FunctionCall, collect called function name
  // functionCallParams: string[]; // only present when valueType is FunctionCall, parameter type checking not needed for now
}

export interface MacroDefineList {
  [macroName: string]: MacroDefineInfo[];
}

const isNumber = (str: string) => !isNaN(Number(str));

const macroRegex = /^\s*#define\s+(\w+)[ ]*(\(([^)]*)\))?[ ]+(\(?\w+\)?.*?)(?:\/\/.*|\/\*.*?\*\/)?\s*$/gm;
const symbolReg = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const funcCallReg = /^([a-zA-Z_][a-zA-Z0-9_]*)\s*\((.*)\)$/;

function isExist(existMacroDefineInfos: MacroDefineInfo[], checkItem: MacroDefineInfo): boolean {
  return existMacroDefineInfos.some(
    (existing) =>
      existing.valueType === checkItem.valueType &&
      existing.value === checkItem.value &&
      existing.isFunction === checkItem.isFunction &&
      existing.functionCallName === checkItem.functionCallName &&
      existing.params.length === checkItem.params.length &&
      existing.params.every((param, index) => param === checkItem.params[index])
  );
}

function parseMacroDefines(source: string, outMacroList: MacroDefineList): void {
  let match: RegExpExecArray | null;

  while ((match = macroRegex.exec(source)) !== null) {
    // Capturing groups: name, paramsGroup, paramsStr, valueRaw
    const [, name, paramsGroup, paramsStr, valueRaw] = match;
    // Only macros with both parameter brackets and value are function macros
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

    if (isNumber(value)) {
      valueType = MacroValueType.Number;
    } else if (symbolReg.test(value)) {
      valueType = MacroValueType.Symbol;
    } else {
      const callMatch = funcCallReg.exec(value);
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

    if (outMacroList[name]) {
      if (!isExist(outMacroList[name], info)) {
        outMacroList[name].push(info);
      }
    } else {
      outMacroList[name] = [];
      outMacroList[name].push(info);
    }
  }
}

function mergeMacroDefineLists(from: MacroDefineList, to: MacroDefineList): void {
  for (const macroName in from) {
    if (to[macroName]) {
      from[macroName].forEach((info) => {
        if (!isExist(to[macroName], info)) {
          to[macroName].push(info);
        }
      });
    } else {
      to[macroName] = from[macroName];
    }
  }
}

/**
 * Get reference symbol names from a macro define list, to visit referenced symbol in shader code.
 * @example
 * #define TEST functionName(0.0, 1.0) // ["functionName"]
 * #define TEST(a) functionName(a)     // ["functionName"]
 * #define TEST(a) b                    // ["b"]
 * #define TEST(b) b                   // []
 */
export function getReferenceSymbolNames(macroDefineList: MacroDefineList, macroName: string, out: string[]): void {
  out.length = 0;
  const infos = macroDefineList[macroName];

  if (infos) {
    for (let i = 0; i < infos.length; i++) {
      const info = infos[i];
      const valueType = info.valueType;

      if (valueType === MacroValueType.FunctionCall || valueType === MacroValueType.Symbol) {
        const referencedName = valueType === MacroValueType.FunctionCall ? info.functionCallName : info.value;
        if (info.params.indexOf(referencedName) !== -1) continue;
        if (out.indexOf(referencedName) === -1) {
          out.push(referencedName);
        }
      } else if (info.valueType === MacroValueType.Other) {
        // #if _VERBOSE
        Logger.warn(
          `Warning: Macro "${info.name}" has an unrecognized value "${info.value}". ShaderLab does not validate this type.`
        );
        // #endif
      }
    }
  }
}

const includeReg = /^[ \t]*#include +"([\w\d./]+)"/gm;

const macroDefineIncludeMap = new Map<string, MacroDefineList>();

export function parseIncludes(
  source: string,
  basePathForIncludeKey: string,
  outMacroDefineList: MacroDefineList,
  parseMacro = true
): string {
  function replace(_, slice: string) {
    let path: string;
    if (slice[0] === ".") {
      // relative path
      // @ts-ignore
      path = new URL(slice, basePathForIncludeKey).href.substring(ShaderPass._shaderRootPath.length);
    } else {
      path = slice;
    }

    const chunk = ShaderLib[path];

    if (!chunk) {
      Logger.error(`Shader slice "${path}" not founded.`);
      return "";
    }

    if (macroDefineIncludeMap.has(path)) {
      mergeMacroDefineLists(macroDefineIncludeMap.get(path), outMacroDefineList);
    } else {
      const chunkMacroDefineList: MacroDefineList = {};
      parseMacroDefines(chunk, chunkMacroDefineList);
      macroDefineIncludeMap.set(path, chunkMacroDefineList);
      mergeMacroDefineLists(chunkMacroDefineList, outMacroDefineList);
    }

    return parseIncludes(chunk, basePathForIncludeKey, outMacroDefineList, false);
  }

  parseMacro && parseMacroDefines(source, outMacroDefineList);
  return source.replace(includeReg, replace);
}
