import { Engine, Entity, ReferResource } from "@galacean/engine-core";

/**
 * The Prefab resource.
 */
export class PrefabResource extends ReferResource {
  /** @internal */
  _root: Entity;

  private readonly _dependenceAssets = new Set<ReferResource>();
  private _templateSources?: Set<PrefabResource>;

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

  /** @internal */
  _instantiateAsTemplate(owner: PrefabResource): Entity {
    const sources = (owner._templateSources ||= new Set());
    if (!sources.has(this)) {
      sources.add(this);
      // GC uses the source Prefab's own reference count when collecting its assets.
      this._addReferCount(1);
    }
    return this._root._clone(owner);
  }

  /**
   * @internal
   */
  _addDependenceAsset(resource: unknown): void {
    // ReflectionParser also passes non-ReferResource assets such as Shader, which have no superResource association.
    // _superResources is a plain array, so the Set ensures each dependency is associated and disassociated exactly once.
    if (!this.destroyed && resource instanceof ReferResource && !this._dependenceAssets.has(resource)) {
      this._dependenceAssets.add(resource);
      resource._associationSuperResource(this);
    }
  }

  protected override _onDestroy(): void {
    super._onDestroy();
    try {
      this._root?.destroy();
    } finally {
      this._root = null!;
      const assets = this._dependenceAssets;
      for (const asset of assets) {
        asset._disassociationSuperResource(this);
      }
      assets.clear();
      const sources = this._templateSources;
      if (sources) {
        for (const source of sources) {
          if (!source.destroyed) source._addReferCount(-1);
        }
        this._templateSources = null!;
      }
    }
  }
}
