import { Lexer } from "../lexer/Lexer";
import { Preprocessor, type ChunkOutputCache, type IncludeMap, type MacroDefineList } from "../Preprocessor";
import { ShaderClueIR, type ShaderSourceMapSegment } from "../ir";
import type { ParsedShaderPassData } from "./ParsedShaderPass";
import { normalizeShaderSourceFile, shaderSourceBaseURL } from "./ShaderIncludePath";
import { ShaderTargetParser } from "./ShaderTargetParser";
import type { ParserObjectPool } from "../ParserObjectPool";

const EMPTY_ERRORS: readonly Error[] = Object.freeze([]);
const EMPTY_SOURCE_MAP: readonly ShaderSourceMapSegment[] = Object.freeze([]);
const EMPTY_PREPROCESSOR_EXPRESSIONS: ReadonlyMap<string, never> = new Map<string, never>();

/**
 * Creates the lean parser used by runtime shader compilation.
 * @param objectPool - Compiler-owned allocator for synchronous parser requests.
 * @returns Reusable runtime parser without authoring diagnostics.
 * @internal
 */
export function createRuntimeShaderTargetParser(objectPool?: ParserObjectPool): ShaderTargetParser {
  return ShaderTargetParser.create(undefined, undefined, undefined, objectPool);
}

/**
 * Parses one shader pass using the lean runtime lexer.
 * @param source - GLSL source for one ShaderLab pass.
 * @param includeMap - Canonical include paths mapped to chunk sources.
 * @param cache - Request-owned expanded-include cache.
 * @param sourceFile - Canonical root source path used for relative includes and error attribution.
 * @param objectPool - Compiler-owned pool used only while synchronously consuming this pass.
 * @param runtimeParser - Compiler-owned parser whose source is replaced for each pass.
 * @returns Request-owned parser output suitable for GLES generation.
 * @internal
 */
export function parseRuntimeShaderPass(
  source: string,
  includeMap: IncludeMap,
  cache: ChunkOutputCache,
  sourceFile?: string,
  objectPool?: ParserObjectPool,
  runtimeParser?: ShaderTargetParser
): ParsedShaderPassData {
  objectPool?.reset();
  const normalizedSourceFile = normalizeShaderSourceFile(sourceFile);
  const preprocessResult = Preprocessor.parseWithErrors(
    source,
    shaderSourceBaseURL(normalizedSourceFile),
    includeMap,
    cache,
    normalizedSourceFile,
    false
  );
  const expandedSource = preprocessResult.content;
  if (preprocessResult.errors.length) {
    const errors = freezeErrors(preprocessResult.errors);
    return Object.freeze({
      ir: null,
      expandedSource,
      sourceMap: EMPTY_SOURCE_MAP,
      preprocessorExpressions: EMPTY_PREPROCESSOR_EXPRESSIONS,
      errors,
      blockingErrors: errors
    });
  }
  const macroDefineList: MacroDefineList = {};
  const lexer = new Lexer(expandedSource, macroDefineList, objectPool);
  const parser = runtimeParser ?? createRuntimeShaderTargetParser(objectPool);
  parser.setSource(expandedSource);
  parser.setSourceMap(EMPTY_SOURCE_MAP);
  const program = parser.parse(lexer.tokenize(), macroDefineList);
  const errors = freezeErrors(preprocessResult.errors, lexer.expressionErrors, parser.errors);
  const blockingErrors = freezeErrors(preprocessResult.errors, lexer.expressionErrors, parser.blockingErrors);

  return Object.freeze({
    ir: program ? Object.freeze(new ShaderClueIR(program, expandedSource, EMPTY_SOURCE_MAP)) : null,
    expandedSource,
    sourceMap: EMPTY_SOURCE_MAP,
    preprocessorExpressions: lexer.preprocessorExpressions,
    errors,
    blockingErrors
  });
}

function freezeErrors(...groups: readonly (readonly Error[])[]): readonly Error[] {
  let count = 0;
  for (const group of groups) count += group.length;
  if (count === 0) return EMPTY_ERRORS;
  const errors: Error[] = [];
  for (const group of groups) errors.push(...group);
  return Object.freeze(errors);
}
