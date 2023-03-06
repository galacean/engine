import { ShaderPass } from "./ShaderPass";
import { ShaderString } from "./ShaderString";

/**
 * Sub shader.
 */
export class SubShader {
  private _tagsMap: Record<number, ShaderString>;
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
  addTag(key: ShaderString, value: ShaderString): void;

  addTag(keyOrKeyName: ShaderString | string, valueOrValueName: ShaderString | string): void {
    const key = typeof keyOrKeyName === "string" ? ShaderString.getByName(keyOrKeyName) : keyOrKeyName;
    const value = typeof valueOrValueName === "string" ? ShaderString.getByName(valueOrValueName) : valueOrValueName;
    const tags = this._tagsMap;

    if (tags[key._uniqueId]) {
      throw `Tag named "${key.name}" already exists.`;
    }
    tags[value._uniqueId] = value;
  }

  /**
   * Get a tag value.
   * @param key - Key of the tag
   * @returns Value of the tag
   */
  getTagValue(key: ShaderString): ShaderString {
    return this._tagsMap[key._uniqueId];
  }
}
