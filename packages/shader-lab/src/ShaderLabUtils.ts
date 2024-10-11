import { ClearableObjectPool, IPoolElement } from "@galacean/engine";
import { GSError, GSErrorName } from "./GSError";
import { ShaderRange } from "./common/ShaderRange";
import { ShaderPosition } from "./common/ShaderPosition";

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

  static createGSError(
    message: string,
    errorName: GSErrorName,
    source: string,
    location: ShaderRange | ShaderPosition,
    file?: string
  ) {
    // #if _VERBOSE
    return new GSError(errorName, message, location, source, file);
    // #else
    throw new Error(message);
    // #endif
  }
}
