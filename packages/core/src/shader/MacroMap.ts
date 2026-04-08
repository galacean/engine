import { Engine } from "../Engine";
import { ShaderMacroCollection } from "./ShaderMacroCollection";

type Tree<T> = {
  [key: number]: Tree<T> | T;
};

/**
 * Cache pool keyed by ShaderMacroCollection bitmask.
 * @internal
 */
export class MacroMap<T> {
  engine: Engine;

  private _cacheHierarchyDepth: number = 1;
  private _cacheMap: Tree<T> = Object.create(null);
  private _lastQueryMap: Record<number, T>;
  private _lastQueryKey: number;

  constructor(engine?: Engine) {
    this.engine = engine;
  }

  get(macros: ShaderMacroCollection): T | null {
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
      let subCache = <Tree<T>>cacheMap[subMask];
      subCache || (cacheMap[subMask] = subCache = Object.create(null));
      cacheMap = subCache;
    }

    const cacheKey = endIndex < maxEndIndex ? 0 : mask[maxEndIndex];
    const value = (<Record<number, T>>cacheMap)[cacheKey];
    if (!value) {
      this._lastQueryKey = cacheKey;
      this._lastQueryMap = <Record<number, T>>cacheMap;
    }
    return value;
  }

  cache(value: T): void {
    this._lastQueryMap[this._lastQueryKey] = value;
  }

  clear(callback?: (value: T) => void): void {
    if (callback) {
      this._recursiveForEach(0, this._cacheMap, callback);
    }
    this._cacheMap = Object.create(null);
    this._cacheHierarchyDepth = 1;
  }

  private _recursiveForEach(hierarchy: number, cacheMap: Tree<T>, callback: (value: T) => void): void {
    if (hierarchy === this._cacheHierarchyDepth - 1) {
      for (let k in cacheMap) {
        callback(<T>cacheMap[k]);
      }
      return;
    }
    ++hierarchy;
    for (let k in cacheMap) {
      this._recursiveForEach(hierarchy, <Tree<T>>cacheMap[k], callback);
    }
  }

  private _resizeCacheMapHierarchy(
    cacheMap: Tree<T>,
    hierarchy: number,
    currentHierarchy: number,
    increaseHierarchy: number
  ): void {
    if (hierarchy == currentHierarchy - 1) {
      for (let k in cacheMap) {
        const value = <T>cacheMap[k];
        let subCacheMap = cacheMap;
        for (let i = 0; i < increaseHierarchy; i++) {
          subCacheMap[i == 0 ? k : 0] = subCacheMap = Object.create(null);
        }
        subCacheMap[0] = value;
      }
    } else {
      hierarchy++;
      for (let k in cacheMap) {
        this._resizeCacheMapHierarchy(<Tree<T>>cacheMap[k], hierarchy, currentHierarchy, increaseHierarchy);
      }
    }
  }
}
