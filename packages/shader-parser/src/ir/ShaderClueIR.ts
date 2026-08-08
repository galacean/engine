import type { ASTNode } from "../parser/AST";
import type { ShaderData } from "../parser/ShaderInfo";

/**
 * Maps a range in the preprocessed shader pass back to its source chunk.
 * @internal
 */
export interface ShaderSourceMapSegment {
  /** Start offset in the preprocessed pass. */
  readonly generatedStart: number;
  /** Exclusive end offset in the preprocessed pass. */
  readonly generatedEnd: number;
  /** Start offset in the original source chunk. */
  readonly sourceStart: number;
  /** Original source chunk. */
  readonly source: string;
  /** Canonical source path represented by this segment. */
  readonly sourceFile?: string;
}

/**
 * Read-only, backend-neutral view of a parsed shader pass.
 *
 * The existing typed AST and symbol table are the backing store; creating this view does not clone
 * the syntax tree. Backends and analysis passes consume this object instead of depending on each
 * other.
 * @internal
 */
export class ShaderClueIR {
  /** Semantic facts collected while parsing the pass. */
  readonly shaderData: ShaderData;

  /**
   * Creates a neutral view over a parsed shader program.
   * @param program - Existing typed AST used as the IR backing store.
   * @param source - Preprocessed pass source represented by the AST.
   * @param sourceMap - Mapping from preprocessed offsets to original source chunks.
   */
  constructor(
    readonly program: ASTNode.GLShaderProgram,
    readonly source: string,
    readonly sourceMap: readonly ShaderSourceMapSegment[] = []
  ) {
    this.shaderData = program.shaderData;
  }
}
