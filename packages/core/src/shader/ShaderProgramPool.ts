import { ShaderMacroCollection } from "./ShaderMacroCollection";
import { ShaderProgram } from "./ShaderProgram";

/**
 * Shader program pool.
 * @internal
 */
export class ShaderProgramPool {
  private _cacheHierarchyDepth: number = 1;
  private _cacheMap: Tree<ShaderProgram> = Object.create(null);
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
    const cacheHierarchyDepth = this._cacheHierarchyDepth;
    if (maskLength > cacheHierarchyDepth) {
      this._resizeCacheMapHierarchy(cacheMap, 0, cacheHierarchyDepth, maskLength - cacheHierarchyDepth);
      this._cacheHierarchyDepth = maskLength;
    }

    const mask = macros._mask;
    const endIndex = macros._length - 1;
    const maxEndIndex = this._cacheHierarchyDepth - 1;
    for (let i = 0; i < maxEndIndex; i++) {
      const subMask = endIndex < i ? 0 : mask[i];
      let subCacheShaders = <Tree<ShaderProgram>>cacheMap[subMask];
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

  /**
   * clear and destroy cached shader programs
   */
  destroy() {
    this._clear();
    this._cacheMap = null;
  }

  private _resizeCacheMapHierarchy(
    cacheMap: Tree<ShaderProgram>,
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
        this._resizeCacheMapHierarchy(<Tree<ShaderProgram>>cacheMap[k], hierarchy, currentHierarchy, increaseHierarchy);
      }
    }
  }

  private _clear(_cacheMap?: Tree<ShaderProgram>) {
    const map = _cacheMap ?? this._cacheMap;
    for (const key in map) {
      const node = map[key];
      if (node instanceof ShaderProgram) {
        node.destroy();
        continue;
      }

      this._clear(node);
    }
  }
}

type Tree<T> = {
  [key: number]: Tree<T> | T;
};
