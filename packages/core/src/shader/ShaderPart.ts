import { ShaderTag } from "./ShaderTag";

export class ShaderPart {
  private _tagsMap: Record<number, ShaderTag>;

  /**
   * Add a tag.
   * @param keyName - Name of the tag key
   * @param valueName - Name of the tag value
   */
  setTag(keyName: string, valueName: string): void;
  /**
   * Add a tag.
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
   * @returns Value of the tag
   */
  deleteTag(KeyName: string);

  /**
   * Delete a tag.
   * @param key - Key of the tag
   * @returns Value of the tag
   */
  deleteTag(key: ShaderTag);

  deleteTag(keyOrKeyName: ShaderTag | string): void {
    delete this._tagsMap[
      typeof keyOrKeyName == "string" ? ShaderTag.getByName(keyOrKeyName)._uniqueId : keyOrKeyName._uniqueId
    ];
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
