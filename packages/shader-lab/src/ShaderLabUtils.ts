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
   * Skip a single comment starting at `index`. Returns the index after the comment,
   * or the original index if no comment starts there.
   * Handles `//` single-line and `/* ... *​/` block comments.
   */
  static skipComment(source: string, index: number): number {
    const length = source.length;
    // 47 = '/'
    if (index + 1 >= length || source.charCodeAt(index) !== 47) return index;

    const next = source.charCodeAt(index + 1);
    if (next === 47) {
      // Single-line comment: skip until \n or \r
      index += 2;
      while (index < length) {
        const c = source.charCodeAt(index);
        if (c === 10 || c === 13) break;
        index++;
      }
      return index;
    }
    if (next === 42) {
      // Block comment: skip until '*/'
      index += 2;
      while (index + 1 < length && !(source.charCodeAt(index) === 42 && source.charCodeAt(index + 1) === 47)) {
        index++;
      }
      return index + 2;
    }
    return index;
  }

  /**
   * Strip all comments from source while preserving newlines for line number stability.
   */
  static removeComments(source: string): string {
    const length = source.length;
    let result = "";
    let i = 0;

    while (i < length) {
      const newIndex = ShaderLabUtils.skipComment(source, i);
      if (newIndex !== i) {
        // Preserve newlines inside the skipped comment
        for (let j = i; j < newIndex; j++) {
          if (source.charCodeAt(j) === 10) result += "\n";
        }
        i = newIndex;
      } else {
        result += source[i];
        i++;
      }
    }

    return result;
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
