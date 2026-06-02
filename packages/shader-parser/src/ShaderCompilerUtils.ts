import { ClearableObjectPool, type IPoolElement } from "./common/ObjectPool";
import { GSErrorName } from "./GSError";
import { ShaderRange } from "./common/ShaderRange";
import { ShaderPosition } from "./common/ShaderPosition";
// #if _VERBOSE
import { GSError } from "./GSError";
// #endif

export class ShaderCompilerUtils {
  private static _shaderCompilerObjectPoolSet: ClearableObjectPool<IPoolElement>[] = [];
  private static _shaderPositionPool = ShaderCompilerUtils.createObjectPool(ShaderPosition);
  private static _shaderRangePool = ShaderCompilerUtils.createObjectPool(ShaderRange);

  // #if _VERBOSE
  /** Source text of the pass being compiled, attached to diagnostics as context. */
  static processingPassText?: string;
  // #endif

  static createObjectPool<T extends IPoolElement>(type: new () => T) {
    const pool = new ClearableObjectPool<T>(type);
    ShaderCompilerUtils._shaderCompilerObjectPoolSet.push(pool);
    return pool;
  }

  static createPosition(index: number, line?: number, column?: number): ShaderPosition {
    const position = ShaderCompilerUtils._shaderPositionPool.get();
    position.set(
      index,
      // #if _VERBOSE
      line,
      column
      // #endif
    );
    return position;
  }

  static createRange(start: ShaderPosition, end: ShaderPosition): ShaderRange {
    const range = ShaderCompilerUtils._shaderRangePool.get();
    range.set(start, end);
    return range;
  }

  static clearAllShaderCompilerObjectPool() {
    for (let i = 0, n = ShaderCompilerUtils._shaderCompilerObjectPoolSet.length; i < n; i++) {
      ShaderCompilerUtils._shaderCompilerObjectPoolSet[i].clear();
    }
  }

  static createGSError(
    message: string,
    errorName: GSErrorName,
    source: string,
    location: ShaderRange | ShaderPosition,
    file?: string
  ): Error {
    // #if _VERBOSE
    return new GSError(errorName, message, location, source, file);
    // #else
    console.error(message);
    const err = new Error(message);
    err.name = errorName;
    return err;
    // #endif
  }
}
