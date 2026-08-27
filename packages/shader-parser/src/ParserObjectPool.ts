import { BaseToken } from "./common/BaseToken";
import { ShaderPosition } from "./common/ShaderPosition";
import { ShaderRange } from "./common/ShaderRange";

interface ObjectList<T> {
  values: T[];
  used: number;
}

interface PooledNodeConstructor<T> {
  new (): T;
  __parserObjectPoolId?: number;
}

let nextNodePoolId = 0;

/**
 * Reuses parser-owned objects while a synchronous compiler consumes one pass at a time.
 *
 * Parsed passes created without this pool remain independently retainable. A caller using the pool
 * must finish consuming a pass before resetting the pool for another parse.
 * @internal
 */
export class ParserObjectPool {
  private readonly _tokens: ObjectList<BaseToken> = { values: [], used: 0 };
  private readonly _positions: ObjectList<ShaderPosition> = { values: [], used: 0 };
  private readonly _ranges: ObjectList<ShaderRange> = { values: [], used: 0 };
  private readonly _nodes: ObjectList<unknown>[] = [];

  /**
   * Resets allocation cursors without releasing the high-water storage.
   * @internal
   */
  reset(): void {
    this._tokens.used = 0;
    this._positions.used = 0;
    this._ranges.used = 0;
    for (const list of this._nodes) {
      if (list) list.used = 0;
    }
  }

  /**
   * Acquires a reusable token.
   * @returns Token storage owned by this pool.
   * @internal
   */
  createToken(): BaseToken {
    const list = this._tokens;
    const index = list.used++;
    return list.values[index] ?? (list.values[index] = new BaseToken(this));
  }

  /**
   * Acquires and initializes a reusable source position.
   * @param index - Zero-based source offset.
   * @param line - Zero-based source line.
   * @param column - Zero-based source column.
   * @returns Source-position storage owned by this pool.
   * @internal
   */
  createPosition(index: number, line: number, column: number): ShaderPosition {
    const list = this._positions;
    const itemIndex = list.used++;
    const position = list.values[itemIndex] ?? (list.values[itemIndex] = new ShaderPosition());
    position.set(index, line, column);
    return position;
  }

  /**
   * Acquires and initializes a reusable source range.
   * @param start - Inclusive range start.
   * @param end - Exclusive range end.
   * @returns Source-range storage owned by this pool.
   * @internal
   */
  createRange(start: ShaderPosition, end: ShaderPosition): ShaderRange {
    const list = this._ranges;
    const index = list.used++;
    const range = list.values[index] ?? (list.values[index] = new ShaderRange());
    range.set(start, end);
    return range;
  }

  /**
   * Acquires a reusable AST node of the requested concrete type.
   * @param type - Concrete AST-node constructor.
   * @returns Node storage owned by this pool.
   * @internal
   */
  createNode<T>(type: new () => T): T {
    const pooledType = type as PooledNodeConstructor<T>;
    const poolId = pooledType.__parserObjectPoolId ?? (pooledType.__parserObjectPoolId = nextNodePoolId++);
    let list = this._nodes[poolId] as ObjectList<T> | undefined;
    if (!list) {
      list = { values: [], used: 0 };
      this._nodes[poolId] = list as ObjectList<unknown>;
    }
    const index = list.used++;
    return list.values[index] ?? (list.values[index] = new type());
  }
}
