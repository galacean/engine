import { ClearableObjectPool, IPoolElement, Logger } from "@galacean/engine";
import { GSErrorName } from "./GSError";
import { ShaderRange } from "./common/ShaderRange";
import { ShaderPosition } from "./common/ShaderPosition";
// #if _VERBOSE
import { GSError } from "./GSError";
// #endif

export class ShaderCompilerUtils {
  private static _shaderCompilerObjectPoolSet: ClearableObjectPool<IPoolElement>[] = [];

  static createObjectPool<T extends IPoolElement>(type: new () => T) {
    const pool = new ClearableObjectPool<T>(type);
    ShaderCompilerUtils._shaderCompilerObjectPoolSet.push(pool);
    return pool;
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
  ): Error | undefined {
    // #if _VERBOSE
    return new GSError(errorName, message, location, source, file);
    // #else
    Logger.error(message);
    // #endif
  }
}
