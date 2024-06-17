import { Engine, Entity, ReferResource } from "@galacean/engine-core";

/**
 * The Prefab asset in runtime.
 */
export class PrefabResource extends ReferResource {
  /** @internal */
  _root: Entity;

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
  }
}
