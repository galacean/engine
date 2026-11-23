import { Engine } from "../Engine";
import { ShaderMacroCollection } from "./ShaderMacroCollection";
import { ShaderProgram } from "./ShaderProgram";

type Tree = {
  [key: number]: Tree | ShaderProgram;
};

/**
 * Map keyed by ShaderMacroCollection bitmask, caching ShaderProgram instances.
 * @internal
 */
export class ShaderProgramMap {
  engine: Engine;

  private _cacheHierarchyDepth: number = 1;
  private _cacheMap: Tree = Object.create(null);
  private _lastQueryMap: Record<number, ShaderProgram>;
  private _lastQueryKey: number;
  private _specializations?: Map<string | number, ShaderProgramMap>;
  private _lastSpecializationKey?: string | number;
  private _lastSpecialization?: ShaderProgramMap;
  private _lastHit?: { macros: ShaderMacroCollection; program: ShaderProgram };

  constructor(engine: Engine) {
    this.engine = engine;
  }

  /** Distinguish native feedback outputs and integer vertex inputs sharing the same macro mask. */
  specialize(key: string | number): ShaderProgramMap {
    if (this._lastSpecializationKey === key) return this._lastSpecialization!;
    const maps = (this._specializations ??= new Map());
    let map = maps.get(key);
    if (!map) maps.set(key, (map = new ShaderProgramMap(this.engine)));
    this._lastSpecializationKey = key;
    return (this._lastSpecialization = map);
  }

  get(macros: ShaderMacroCollection): ShaderProgram | null {
    const hit = this._lastHit;
    if (hit?.macros.isEqual(macros)) return hit.program;
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
    if (value) {
      const recent = hit ?? (this._lastHit = { macros: new ShaderMacroCollection(), program: value });
      recent.program = value;
      ShaderMacroCollection.unionCollection(macros, macros, recent.macros);
    } else {
      this._lastQueryKey = cacheKey;
      this._lastQueryMap = <Record<number, ShaderProgram>>cacheMap;
    }
    return value;
  }

  cache(value: ShaderProgram): void {
    this._lastQueryMap[this._lastQueryKey] = value;
    this._lastHit = undefined;
  }

  destroy(): void {
    this._lastSpecializationKey = undefined;
    this._lastSpecialization = undefined;
    this._lastHit = undefined;
    this._specializations?.forEach((map) => map.destroy());
    this._specializations = undefined;
    this._recursiveForEach(0, this._cacheMap);
    this._cacheMap = Object.create(null);
    this._cacheHierarchyDepth = 1;
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
