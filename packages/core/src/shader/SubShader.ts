import { ShaderPass } from "./ShaderPass";
import { ShaderTag } from "./ShaderTag";

/**
 * Sub shader.
 */
export class SubShader {
  private _tagsMap: Record<number, ShaderTag>;
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
  constructor(public readonly name: string, passes: ShaderPass[]) {
    const passCount = passes.length;
    if (passCount < 1) {
      throw " count must large than 0.";
    }
    this._passes = passes.slice();
  }

  /**
   * Add a tag.
   * @param keyName - Name of the tag key
   * @param valueName - Name of the tag value
   */
  addTag(keyName: string, valueName: string): void;
  /**
   * Add a tag.
   * @param key - Key of the tag
   * @param value - Value of the tag
   */
  addTag(key: ShaderTag, value: ShaderTag): void;

  addTag(keyOrKeyName: ShaderTag | string, valueOrValueName: ShaderTag | string): void {
    const key = typeof keyOrKeyName === "string" ? ShaderTag.getByName(keyOrKeyName) : keyOrKeyName;
    const value = typeof valueOrValueName === "string" ? ShaderTag.getByName(valueOrValueName) : valueOrValueName;
    const tags = this._tagsMap;

    if (tags[key._uniqueId]) {
      throw `Tag named "${key.name}" already exists.`;
    }
    tags[key._uniqueId] = value;
  }

  /**
   * Get a tag value.
   * @param key - Key of the tag
   * @returns Value of the tag
   */
  getTagValue(key: ShaderTag): ShaderTag {
    return this._tagsMap[key._uniqueId];
  }
}
