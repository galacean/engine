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
    const cacheHierarchy = this._cacheHierarchy;
    if (maskLength > cacheHierarchy) {
      this._resizeCacheMapHierarchy(cacheMap, 0, cacheHierarchy, maskLength - cacheHierarchy);
      this._cacheHierarchy = maskLength;
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

  private _resizeCacheMapHierarchy(
    cacheMap: object,
    hierarchy: number,
    currentHierarchy: number,
    increaseHierarchy: number
  ): void {
    // Only expand but not shrink
    if (hierarchy == currentHierarchy - 1) {
      for (let k in cacheMap) {
        const shader = <ShaderProgram>cacheMap[k];
        let subCacheMap = cacheMap;
        for (let i = 0; i < increaseHierarchy; i++) {
          subCacheMap[i == 0 ? k : 0] = subCacheMap = Object.create(null);
        }
        subCacheMap[0] = shader;
      }
    } else {
      hierarchy++;
      for (let k in cacheMap) {
        this._resizeCacheMapHierarchy(cacheMap[k], hierarchy, currentHierarchy, increaseHierarchy);
      }
    }
  }
}
