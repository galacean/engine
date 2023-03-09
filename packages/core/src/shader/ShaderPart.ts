import { ShaderTagProperty } from "./ShaderTagProperty";

/**
 * Base class for shader structure.
 */
export abstract class ShaderPart {
  private _tagsMap: Record<number, ShaderTagProperty> = Object.create(null);

  /**
   * Set tag by name.
   * @param keyName - Name of the tag key
   * @param valueName - Name of the tag value
   */
  setTag(keyName: string, valueName: string): void;
  
  /**
   * Set tag.
   * @param key - Key of the tag
   * @param value - Value of the tag
   */
  setTag(key: ShaderTagProperty, value: ShaderTagProperty): void;

  setTag(keyOrKeyName: ShaderTagProperty | string, valueOrValueName: ShaderTagProperty | string): void {
    const key = typeof keyOrKeyName === "string" ? ShaderTagProperty.getByName(keyOrKeyName) : keyOrKeyName;
    const value = typeof valueOrValueName === "string" ? ShaderTagProperty.getByName(valueOrValueName) : valueOrValueName;
    const tags = this._tagsMap;

    if (tags[key._uniqueId]) {
      throw `Tag named "${key.name}" already exists.`;
    }
    tags[key._uniqueId] = value;
  }

  /**
   * Delete a tag by key name.
   * @param KeyName - Key name of the tag
   */
  deleteTag(KeyName: string): void;

  /**
   * Delete a tag by key.
   * @param key - Key of the tag
   */
  deleteTag(key: ShaderTagProperty): void;

  deleteTag(keyOrKeyName: ShaderTagProperty | string): void {
    delete this._tagsMap[
      typeof keyOrKeyName == "string" ? ShaderTagProperty.getByName(keyOrKeyName)._uniqueId : keyOrKeyName._uniqueId
    ];
  }

  /**
   * Get tag value by key name.
   * @param keyName - Key name of the tag
   * @returns Value of the tag
   */
  getTagValue(keyName: string): ShaderTagProperty;

  /**
   * Get tag value by key.
   * @param key - Key of the tag
   * @returns Value of the tag
   */
  getTagValue(key: ShaderTagProperty): ShaderTagProperty;

  getTagValue(keyOrKeyName: ShaderTagProperty | string): ShaderTagProperty {
    return this._tagsMap[
      typeof keyOrKeyName == "string" ? ShaderTagProperty.getByName(keyOrKeyName)._uniqueId : keyOrKeyName._uniqueId
    ];
  }
}
