import { EngineObject, Logger } from "../base";
import { ShaderTagKey } from "./ShaderTagKey";

/**
 * Base class for shader structure.
 */
export abstract class ShaderPart extends EngineObject {
  protected _name: string;

  private _tagsMap: Record<number, number | string | boolean> = Object.create(null);

  /**
   * Name.
   */
  get name(): string {
    return this._name;
  }

  /**
   * Set tag by key name.
   * @param keyName - Key name of the tag
   * @param value - Tag value
   */
  setTag<T extends number | string | boolean>(keyName: string, value: T): void;

  /**
   * Set tag.
   * @param key - Key of the tag
   * @param value - Tag value
   */
  setTag<T extends number | string | boolean>(key: ShaderTagKey, value: T): void;

  setTag<T extends number | string | boolean>(keyOrKeyName: ShaderTagKey | string, value: T): void {
    const key = typeof keyOrKeyName === "string" ? ShaderTagKey.getByName(keyOrKeyName) : keyOrKeyName;
    const tags = this._tagsMap;

    if (tags[key._uniqueId] !== undefined) {
      Logger.warn(`The value of tag named "${key.name}" is being replaced.`);
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
  deleteTag(key: ShaderTagKey): void;

  deleteTag(keyOrKeyName: ShaderTagKey | string): void {
    delete this._tagsMap[
      (typeof keyOrKeyName == "string" ? ShaderTagKey.getByName(keyOrKeyName) : keyOrKeyName)._uniqueId
    ];
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
  getTagValue<T extends number | string | boolean>(key: ShaderTagKey): T;

  getTagValue<T extends number | string | boolean>(keyOrKeyName: ShaderTagKey | string): T {
    return this._tagsMap[
      typeof keyOrKeyName == "string" ? ShaderTagKey.getByName(keyOrKeyName)._uniqueId : keyOrKeyName._uniqueId
    ] as T;
  }
}
