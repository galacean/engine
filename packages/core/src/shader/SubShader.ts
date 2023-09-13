import { ShaderPart } from "./ShaderPart";
import { ShaderPass } from "./ShaderPass";

/**
 * Sub shader.
 */
export class SubShader extends ShaderPart {
  private _passes: ShaderPass[];

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
}
