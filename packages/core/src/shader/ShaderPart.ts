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
  setTagValue<T extends number | string | boolean>(keyName: string, value: T): void;

  /**
   * Set tag.
   * @param key - Key of the tag
   * @param value - Tag value
   */
  setTagValue<T extends number | string | boolean>(key: ShaderTag, value: T): void;

  setTagValue<T extends number | string | boolean>(keyOrKeyName: ShaderTag | string, value: T): void {
    const key = typeof keyOrKeyName === "string" ? ShaderTag.getByName(keyOrKeyName) : keyOrKeyName;
    const tags = this._tagsMap;

    if (tags[key._uniqueId]) {
      throw `Tag named "${key.name}" already exists.`;
    }
    tags[key._uniqueId] = value;
  }

  /**
   * Get tag by key name.
   * @param keyName - Key name of the tag
   * @returns Tag value
   */
  getTagValue<T extends number | string | boolean>(keyName: string): T;

  /**
   * Get tag value by key.
   * @param key - Key of the tag
   * @returns Tag value
   */
  getTagValue<T extends number | string | boolean>(key: ShaderTag): T;

  getTagValue<T extends number | string | boolean>(keyOrKeyName: ShaderTag | string): T {
    return <T>(
      this._tagsMap[
        typeof keyOrKeyName == "string" ? ShaderTag.getByName(keyOrKeyName)._uniqueId : keyOrKeyName._uniqueId
      ]
    );
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
}
