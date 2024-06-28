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
   * Instantiate prefab.
   * @returns prefab's root entity
   */
  instantiate(): Entity {
    return this._root?.clone();
  }

  /**
   * @internal
   */
  _addDependenceAsset(resource: ReferResource) {
    this._dependenceAssets.add(resource);
    // @ts-ignore
    resource._associationSuperResource(this);
  }

  protected override _onDestroy(): void {
    super._onDestroy();
    this._root.destroy();
    this._dependenceAssets.forEach((asset) => {
      // @ts-ignore
      asset._disassociationSuperResource(this);
    });
  }
}
