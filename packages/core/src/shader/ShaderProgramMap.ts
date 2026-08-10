import { Engine } from "../Engine";
import { ShaderMacroCollection } from "./ShaderMacroCollection";
import { ShaderProgram } from "./ShaderProgram";

type Tree = {
  [key: number]: Tree | ShaderProgram;
};

/**
 * Caches shader programs by program variant and shader macro bitmask.
 * @internal
 */
export class ShaderProgramMap {
  engine: Engine;

  private _cacheHierarchyDepth: number = 1;
  private _cacheMap: Tree = Object.create(null);
  private _variantMaps: Map<object, ShaderProgramMap> | null = null;
  private _lastQueryMap: Record<number, ShaderProgram>;
  private _lastQueryKey: number;

  constructor(engine: Engine) {
    this.engine = engine;
  }

  getVariant(key: object): ShaderProgramMap {
    const variants = (this._variantMaps ||= new Map());
    let variant = variants.get(key);
    if (!variant) {
      variant = new ShaderProgramMap(this.engine);
      variants.set(key, variant);
    }
    return variant;
  }

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
      let subCache = <Tree>cacheMap[subMask];
      subCache || (cacheMap[subMask] = subCache = Object.create(null));
      cacheMap = subCache;
    }

    const cacheKey = endIndex < maxEndIndex ? 0 : mask[maxEndIndex];
    const value = (<Record<number, ShaderProgram>>cacheMap)[cacheKey];
    if (!value) {
      this._lastQueryKey = cacheKey;
      this._lastQueryMap = <Record<number, ShaderProgram>>cacheMap;
    }
    return value;
  }

  cache(value: ShaderProgram): void {
    this._lastQueryMap[this._lastQueryKey] = value;
  }

  destroy(): void {
    this._recursiveForEach(0, this._cacheMap);
    this._cacheMap = Object.create(null);
    this._cacheHierarchyDepth = 1;
    const variants = this._variantMaps;
    if (variants) {
      for (const variant of variants.values()) {
        variant.destroy();
      }
      variants.clear();
      this._variantMaps = null;
    }
  }

  private _recursiveForEach(hierarchy: number, cacheMap: Tree): void {
    if (hierarchy === this._cacheHierarchyDepth - 1) {
      for (const k in cacheMap) {
        (<ShaderProgram>cacheMap[k]).destroy();
      }
      return;
    }
    ++hierarchy;
    for (const k in cacheMap) {
      this._recursiveForEach(hierarchy, <Tree>cacheMap[k]);
    }
  }

  private _resizeCacheMapHierarchy(
    cacheMap: Tree,
    hierarchy: number,
    currentHierarchy: number,
    increaseHierarchy: number
  ): void {
    if (hierarchy == currentHierarchy - 1) {
      for (const k in cacheMap) {
        const value = <ShaderProgram>cacheMap[k];
        let subCacheMap = cacheMap;
        for (let i = 0; i < increaseHierarchy; i++) {
          subCacheMap[i == 0 ? k : 0] = subCacheMap = Object.create(null);
        }
        subCacheMap[0] = value;
      }
    } else {
      hierarchy++;
      for (const k in cacheMap) {
        this._resizeCacheMapHierarchy(<Tree>cacheMap[k], hierarchy, currentHierarchy, increaseHierarchy);
      }
    }
  }
}
