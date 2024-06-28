import { Engine, Entity, ReferResource } from "@galacean/engine-core";

/**
 * The Prefab resource.
 */
export class PrefabResource extends ReferResource {
  _root: Entity;
  /** @internal */

  private dependenceAssets: Set<ReferResource> = new Set();

  /**
   * @internal
   */
  constructor(
    engine: Engine,
    public readonly url: string
  ) {
    super(engine);
  }

  /**
   * Instantiate root entity.
   * @returns Root entity
   */
  instantiate(): Entity {
    return this._root?.clone();
  }

  protected override _onDestroy(): void {
    super._onDestroy();
    this._root.destroy();
    this.dependenceAssets.forEach((asset) => {
      // @ts-ignore
      asset._disassociationSuperResource(this);
    });
  }

  /** @internal */
  _addDependenceAsset(resource: ReferResource) {
    this.dependenceAssets.add(resource);
    // @ts-ignore
    resource._associationSuperResource(this);
  }
}
