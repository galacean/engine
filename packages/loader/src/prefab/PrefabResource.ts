import { Engine, Entity, ReferResource } from "@galacean/engine-core";
import type { GLTFResource } from "../gltf/GLTFResource";

/**
 * The Prefab resource.
 */
export class PrefabResource extends ReferResource {
  /** @internal */
  _root: Entity;

  private _dependenceAssets?: Set<ReferResource>;
  private _templateSources?: Set<PrefabResource | GLTFResource>;

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
   * Clone a detached template root and retain its source for this prefab's lifetime.
   * @internal
   */
  _instantiateTemplate(source: PrefabResource | GLTFResource): Entity {
    const sources = (this._templateSources ||= new Set());
    const count = sources.size;
    if (sources.add(source).size !== count) {
      // GC checks the source's reference count when collecting its assets.
      source._addReferCount(1);
    }
    const root = source instanceof PrefabResource ? source._root : source._defaultSceneRoot;
    return root._clone(this);
  }

  /**
   * @internal
   */
  _addDependenceAsset(resource: unknown): void {
    // ReflectionParser also passes non-ReferResource assets such as Shader, which have no superResource association.
    // _superResources is a plain array, so the Set ensures each dependency is associated and disassociated exactly once.
    if (!this.destroyed && resource instanceof ReferResource) {
      const assets = (this._dependenceAssets ||= new Set());
      const count = assets.size;
      if (assets.add(resource).size !== count) resource._associationSuperResource(this);
    }
  }

  protected override _onDestroy(): void {
    super._onDestroy();
    try {
      this._root?.destroy();
    } finally {
      this._root = null!;
      const assets = this._dependenceAssets;
      if (assets) {
        for (const asset of assets) asset._disassociationSuperResource(this);
        this._dependenceAssets = undefined;
      }
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
