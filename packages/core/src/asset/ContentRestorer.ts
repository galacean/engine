import { EngineObject } from "../base";
import { AssetPromise } from "./AssetPromise";

/**
 * ContentRestorer is a base class for all content restore info classes.
 */
export abstract class ContentRestorer<T extends EngineObject> {
  /**
   * @param resource - The resource object of the content restorer
   */
  constructor(public resource: T) {}

  /**
   * Restore the content of the resource.
   * @returns The promise of the restored content if the content is restored asynchronously, otherwise returns undefined
   */
  abstract restoreContent(): AssetPromise<T> | void;
}
