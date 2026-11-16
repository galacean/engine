import { Engine, Entity, ReferResource } from "@galacean/engine-core";

/**
 * The Prefab resource.
 */
export class PrefabResource extends ReferResource {
  /** @internal */
  _root: Entity;

  private _dependenceAssets: Set<ReferResource> = new Set();

  /**
   * @internal
   * @param url - The url of the prefab
   */
  constructor(
    engine: Engine,
    public readonly url: string
  ) {
    super(engine);
  }

  /**
   * Instantiate the prefab.
   * @returns A detached prefab instance that must be added to a parent Entity or Scene to update and render
   */
  instantiate(): Entity {
    return this._root?.clone();
  }

  /**
   * @internal
   */
  _addDependenceAsset(resource: unknown): void {
    if (resource instanceof ReferResource && !this._dependenceAssets.has(resource)) {
      this._dependenceAssets.add(resource);
      resource._associationSuperResource(this);
    }
  }

  protected override _onDestroy(): void {
    super._onDestroy();
    this._root?.destroy();
    this._dependenceAssets.forEach((asset) => {
      asset._disassociationSuperResource(this);
    });
  }
}
