import { ShaderTag } from "./ShaderTag";

/**
 * Base class for shader structure.
 */
export abstract class ShaderPart {
  private _tagsMap: Record<number, number | string | boolean> = Object.create(null);

  /**
   * Set tag by key name.
   * @param keyName - Key name of the tag
   * @param value - Tag value
   */
  setTag(keyName: string, value: number | string | boolean): void;

  /**
   * Set tag.
   * @param key - Key of the tag
   * @param value - Tag value
   */
  setTag(key: ShaderTag, value: number | string | boolean): void;

  setTag(keyOrKeyName: ShaderTag | string, value: number | string | boolean): void {
    const key = typeof keyOrKeyName === "string" ? ShaderTag.getByName(keyOrKeyName) : keyOrKeyName;
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
   * Get tag by key name.
   * @param keyName - Key name of the tag
   * @returns Tag value
   */
  getTagValue(keyName: string): number | string | boolean;

  /**
   * Get tag value by key.
   * @param key - Key of the tag
   * @returns Tag value
   */
  getTagValue(key: ShaderTag): number | string | boolean;

  getTagValue(keyOrKeyName: ShaderTag | string): number | string | boolean {
    return this._tagsMap[
      typeof keyOrKeyName == "string" ? ShaderTag.getByName(keyOrKeyName)._uniqueId : keyOrKeyName._uniqueId
    ];
  }
}
