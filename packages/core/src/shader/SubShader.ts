import { Engine } from "../Engine";
import { ShaderFactory, InstanceLayout } from "../shaderlib/ShaderFactory";
import { MacroMap } from "./MacroMap";
import { ShaderMacroCollection } from "./ShaderMacroCollection";
import { ShaderPart } from "./ShaderPart";
import { ShaderPass } from "./ShaderPass";

/**
 * Sub shader.
 */
export class SubShader extends ShaderPart {
  private _passes: ShaderPass[];
  private _layoutCache: MacroMap<InstanceLayout> = new MacroMap();

  /**
   * Sub shader passes.
   */
  get passes(): ReadonlyArray<ShaderPass> {
    return this._passes;
  }

  /**
   * Create a sub shader.
   * @param name - Name of the sub shader
   * @param passes - Sub shader passes
   */
  constructor(name: string, passes: ShaderPass[], tags?: Record<string, number | string | boolean>) {
    super();
    this._name = name;
    const passCount = passes.length;
    if (passCount < 1) {
      throw " count must large than 0.";
    }
    this._passes = passes.slice();

    for (const key in tags) {
      this.setTag(key, tags[key]);
    }
  }

  /**
   * @internal
   */
  _getInstanceLayout(engine: Engine, macroCollection: ShaderMacroCollection): InstanceLayout | null {
    const cached = this._layoutCache.get(macroCollection);
    if (cached) return cached;

    const passes = this._passes;
    const fieldMap: Record<number, string> = Object.create(null);
    let hasField = false;
    for (let i = 0, n = passes.length; i < n; i++) {
      if (passes[i]._scanInstanceFields(engine, macroCollection, fieldMap)) hasField = true;
    }
    if (!hasField) return null;

    const result = ShaderFactory._buildLayout(engine, fieldMap);
    this._layoutCache.cache(result);
    return result;
  }

  /**
   * @internal
   */
  _destroy(): void {
    this._layoutCache.clear();
  }
}
