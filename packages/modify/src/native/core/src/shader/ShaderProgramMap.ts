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
  private _programsBySource = new Map<string, ShaderProgram>();
  private _ownedPrograms = new Set<ShaderProgram>();

  constructor(engine: Engine) {
    this.engine = engine;
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
    this._ownedPrograms.add(value);
  }

  /** Source aliases do not change the pending macro-cache insertion point. */
  getBySource(key: string): ShaderProgram | undefined {
    return this._programsBySource.get(key);
  }

  cacheBySource(key: string, program: ShaderProgram): void {
    this._programsBySource.set(key, program);
    this._ownedPrograms.add(program);
  }

  destroy(): void {
    // Several macro keys can reference one program. Destroy each owned GL resource once.
    for (const program of this._ownedPrograms) program.destroy();
    this._ownedPrograms.clear();
    this._programsBySource.clear();
    this._cacheMap = Object.create(null);
    this._cacheHierarchyDepth = 1;
    this._lastQueryMap = null!;
  }

  private _resizeCacheMapHierarchy(
    cacheMap: Tree,
    hierarchy: number,
    currentHierarchy: number,
    increaseHierarchy: number
  ): void {
    if (hierarchy == currentHierarchy - 1) {
      for (let k in cacheMap) {
        const value = <ShaderProgram>cacheMap[k];
        let subCacheMap = cacheMap;
        for (let i = 0; i < increaseHierarchy; i++) {
          subCacheMap[i == 0 ? k : 0] = subCacheMap = Object.create(null);
        }
        subCacheMap[0] = value;
      }
    } else {
      hierarchy++;
      for (let k in cacheMap) {
        this._resizeCacheMapHierarchy(<Tree>cacheMap[k], hierarchy, currentHierarchy, increaseHierarchy);
      }
    }
  }
}
