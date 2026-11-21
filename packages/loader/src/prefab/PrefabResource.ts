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
   * Creates a detached instance of this prefab.
   * @remarks Add the instance to a scene hierarchy for it to update and render.
   * @throws If this prefab is pending destruction or has been destroyed.
   */
  instantiate(): Entity {
    if (this.pendingDestroy || this.destroyed) {
      throw new Error("Cannot instantiate a prefab that is pending destruction or destroyed.");
    }
    return this._root.clone();
  }

  /**
   * Clones a source root into this template, retaining each source once.
   * @remarks Descendants retain their original template owners so they can outlive this prefab.
   * @internal
   */
  _instantiateTemplate(source: PrefabResource | GLTFResource): Entity {
    const sources = (this._templateSources ||= new Set());
    const count = sources.size;
    if (sources.add(source).size !== count) {
      source._addReferCount(1);
    }
    const root = source instanceof PrefabResource ? source._root : source._defaultSceneRoot;
    return root._clone(this);
  }

  /**
   * Associates each `ReferResource` with its prefab owner once so resource collection can account for this prefab.
   * @internal
   */
  _addDependenceAsset(resource: unknown): void {
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
