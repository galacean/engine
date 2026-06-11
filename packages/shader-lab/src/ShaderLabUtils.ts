import { ClearableObjectPool, IPoolElement, Logger } from "@galacean/engine";
import { GSErrorName } from "./GSError";
import { ShaderRange } from "./common/ShaderRange";
import { ShaderPosition } from "./common/ShaderPosition";
// #if _VERBOSE
import { GSError } from "./GSError";
// #endif

export class ShaderLabUtils {
  private static _shaderLabObjectPoolSet: ClearableObjectPool<IPoolElement>[] = [];

  static createObjectPool<T extends IPoolElement>(type: new () => T) {
    const pool = new ClearableObjectPool<T>(type);
    ShaderLabUtils._shaderLabObjectPoolSet.push(pool);
    return pool;
  }

  static clearAllShaderLabObjectPool() {
    for (let i = 0, n = ShaderLabUtils._shaderLabObjectPoolSet.length; i < n; i++) {
      ShaderLabUtils._shaderLabObjectPoolSet[i].clear();
    }
  }

  /**
   * Truly release all pooled objects, in contrast to `clearAllShaderLabObjectPool`
   * which only resets the used counter and keeps every element referenced (pool
   * capacity stays at the compilation-time peak — ~150k token/AST objects in real
   * projects). Call when compilation has converged (e.g. after shader warm-up);
   * pools transparently re-allocate on demand if compilation happens again.
   */
  static releaseAllShaderLabObjectPool() {
    for (let i = 0, n = ShaderLabUtils._shaderLabObjectPoolSet.length; i < n; i++) {
      ShaderLabUtils._shaderLabObjectPoolSet[i].garbageCollection();
    }
  }

  static createGSError(
    message: string,
    errorName: GSErrorName,
    source: string,
    location: ShaderRange | ShaderPosition,
    file?: string
  ): Error | undefined {
    // #if _VERBOSE
    return new GSError(errorName, message, location, source, file);
    // #else
    Logger.error(message);
    // #endif
  }
}
