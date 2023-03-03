import { ShaderPass } from "./ShaderPass";

/**
 * Sub shader.
 */
export class SubShader {
  private _tags: Record<string, string> = {};
  private _passes: ShaderPass[] = [];

  /**
   *  Shader passes.
   */
  get passes(): ReadonlyArray<ShaderPass> {
    return this._passes;
  }

  /**
   * Add a tag.
   * @param name - Name of the tag
   * @param value - Value of the tag
   */
  addTag(name: string, value: string): void {
    const tags = this._tags;
    if (tags[name]) {
      throw `Tag named "${name}" already exists.`;
    }

    tags[name] = value;
  }
}
