import { ShaderMacroCollection } from "./ShaderMacroCollection";
import { ShaderProgram } from "./ShaderProgram";

/**
 * Shader program pool.
 * @internal
 */
export class ShaderProgramPool {
  private _cacheHierarchy: number = 1;
  private _cacheMap: object = Object.create(null);
  private _lastQueryMap: Record<number, ShaderProgram>;
  private _lastQueryKey: number;

  /**
   * Get shader program by macro collection.
   * @param macros - macro collection
   * @returns shader program
   */
  get(macros: ShaderMacroCollection): ShaderProgram | null {
    let cacheMap = this._cacheMap;
    const maskLength = macros._length;
    if (maskLength > this._cacheHierarchy) {
      this._resizeCacheMapHierarchy(cacheMap, 0, maskLength);
    }

    const mask = macros._mask;
    const endIndex = macros._length - 1;
    const maxEndIndex = this._cacheHierarchy - 1;
    for (let i = 0; i < maxEndIndex; i++) {
      const subMask = endIndex < i ? 0 : mask[i];
      let subCacheShaders: object = cacheMap[subMask];
      subCacheShaders || (cacheMap[subMask] = subCacheShaders = Object.create(null));
      cacheMap = subCacheShaders;
    }

    const cacheKey = endIndex < maxEndIndex ? 0 : mask[maxEndIndex];
    const shader = (<Record<number, ShaderProgram>>cacheMap)[cacheKey];
    if (!shader) {
      this._lastQueryKey = cacheKey;
      this._lastQueryMap = <Record<number, ShaderProgram>>cacheMap;
    }
    return shader;
  }

  /**
   * Cache the shader program.
   *
   * @remarks
   * The method must return an empty value after calling get() to run normally.
   *
   * @param shaderProgram - shader program
   */
  cache(shaderProgram: ShaderProgram): void {
    this._lastQueryMap[this._lastQueryKey] = shaderProgram;
  }

  private _resizeCacheMapHierarchy(cacheMap: object, hierarchy: number, resizeLength: number): void {
    // only expand but not shrink.
    const end = this._cacheHierarchy - 1;
    if (hierarchy == end) {
      for (let k in cacheMap) {
        const shader: ShaderProgram = cacheMap[k];
        let subCacheMap = cacheMap;
        for (let i = 0, n = resizeLength - end; i < n; i++) {
          if (i == n - 1) {
            subCacheMap[0] = shader;
          } else {
            subCacheMap = subCacheMap[i == 0 ? k : 0] = Object.create(null);
          }
        }
      }
      this._cacheHierarchy = resizeLength;
    } else {
      for (let k in cacheMap) {
        this._resizeCacheMapHierarchy(cacheMap[k], ++hierarchy, resizeLength);
      }
    }
  }
}
