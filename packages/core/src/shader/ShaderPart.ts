import { ShaderTag } from "./ShaderTag";

/**
 * Base class for shader structure.
 */
export abstract class ShaderPart {
  private _tagsMap: Record<number, ShaderTag> = Object.create(null);

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
  setTag(key: ShaderTag, value: ShaderTag): void;

  setTag(keyOrKeyName: ShaderTag | string, valueOrValueName: ShaderTag | string): void {
    const key = typeof keyOrKeyName === "string" ? ShaderTag.getByName(keyOrKeyName) : keyOrKeyName;
    const value = typeof valueOrValueName === "string" ? ShaderTag.getByName(valueOrValueName) : valueOrValueName;
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
  deleteTag(key: ShaderTag): void;

  deleteTag(keyOrKeyName: ShaderTag | string): void {
    delete this._tagsMap[
      typeof keyOrKeyName == "string" ? ShaderTag.getByName(keyOrKeyName)._uniqueId : keyOrKeyName._uniqueId
    ];
  }

  /**
   * Get tag value by key name.
   * @param keyName - Key name of the tag
   * @returns Value of the tag
   */
  getTagValue(keyName: string): ShaderTag;

  /**
   * Get tag value by key.
   * @param key - Key of the tag
   * @returns Value of the tag
   */
  getTagValue(key: ShaderTag): ShaderTag;

  getTagValue(keyOrKeyName: ShaderTag | string): ShaderTag {
    return this._tagsMap[
      typeof keyOrKeyName == "string" ? ShaderTag.getByName(keyOrKeyName)._uniqueId : keyOrKeyName._uniqueId
    ];
  }
}
