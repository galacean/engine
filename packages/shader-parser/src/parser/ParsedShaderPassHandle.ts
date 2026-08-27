import type { ShaderCoreInfo } from "../ir/ShaderCoreInfo";
import type { ParsedShaderPassData } from "./ParsedShaderPass";

const parsedShaderPassPayloads = new WeakMap<ParsedShaderPass, ParsedShaderPassPayload>();

declare const parsedShaderPassBrand: unique symbol;

/**
 * Opaque, immutable handle for one parsed ShaderLab pass.
 *
 * `ShaderAnalyzer.analyze()` creates these handles and `ShaderCompiler.generate()` consumes them, allowing diagnostics
 * and backend generation to share the same parse without exposing parser AST or IR internals.
 */
export interface ParsedShaderPass {
  readonly [parsedShaderPassBrand]: never;
}

/** @internal */
export interface ParsedShaderPassPayload {
  readonly data: ParsedShaderPassData;
  readonly vertexEntry: string;
  readonly fragmentEntry: string;
  readonly coreInfo?: ShaderCoreInfo;
}

/**
 * Creates the opaque public handle for a request-owned parsed pass.
 * @param data - Internal parser output.
 * @param vertexEntry - Vertex entry function name declared by the ShaderLab pass.
 * @param fragmentEntry - Fragment entry function name declared by the ShaderLab pass.
 * @param coreInfo - Optional parser-owned stage facts already derived by the analyzer.
 * @returns Immutable handle accepted by backend generation.
 * @internal
 */
export function createParsedShaderPass(
  data: ParsedShaderPassData,
  vertexEntry: string,
  fragmentEntry: string,
  coreInfo?: ShaderCoreInfo
): ParsedShaderPass {
  const pass = Object.freeze({}) as ParsedShaderPass;
  parsedShaderPassPayloads.set(pass, Object.freeze({ data, vertexEntry, fragmentEntry, coreInfo }));
  return pass;
}

/**
 * Reads the parser-owned payload behind a public pass handle.
 * @param pass - Handle returned by `createParsedShaderPass`.
 * @returns Internal parser data, ShaderLab entries, and any reusable stage facts.
 * @throws TypeError when the value was not created by this parser package instance.
 * @internal
 */
export function getParsedShaderPassPayload(pass: ParsedShaderPass): ParsedShaderPassPayload {
  const payload = parsedShaderPassPayloads.get(pass);
  if (!payload) throw new TypeError("Invalid parsed shader pass handle.");
  return payload;
}
