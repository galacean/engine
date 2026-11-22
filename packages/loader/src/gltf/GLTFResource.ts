import {
  AnimationClip,
  AnimatorController,
  Camera,
  Engine,
  Entity,
  Light,
  Material,
  ModelMesh,
  ReferResource,
  Skin,
  Texture2D
} from "@galacean/engine-core";

/**
 * The glTF resource.
 */
export class GLTFResource extends ReferResource {
  /** glTF file url. */
  readonly url: string;
  /** The array of loaded textures. */
  readonly textures?: Texture2D[];
  /** The array of loaded materials. */
  readonly materials?: Material[];
  /** The array of loaded Meshes. */
  readonly meshes?: ModelMesh[][];
  /** The array of loaded skins. */
  readonly skins?: Skin[];
  /** The array of loaded animationClips. */
  readonly animations?: AnimationClip[];
  /** The loaded  AnimatorController. */
  readonly animatorController?: AnimatorController;

  /** @internal */
  _defaultSceneRoot: Entity;
  /** @internal */
  _sceneRoots: Entity[];
  /** @internal */
  _extensionsData: Record<string, any>;

  private _associatedResources: Set<ReferResource> = new Set();

  /**
   * Extensions data.
   */
  get extensionsData(): Record<string, any> {
    return this._extensionsData;
  }

  /**
   * @internal
   */
  constructor(engine: Engine, url: string) {
    super(engine);
    this.url = url;
  }

  /**
   * Instantiate a glTF scene root Entity.
   * @param sceneIndex - The scene index
   * @returns A detached scene-root instance that must be added to a parent Entity or Scene to update and render
   */
  instantiateSceneRoot(sceneIndex?: number): Entity {
    const sceneRoot = sceneIndex === undefined ? this._defaultSceneRoot : this._sceneRoots[sceneIndex];
    return sceneRoot.clone();
  }

  /**
   * @internal
   */
  _associateResource(resource: ReferResource): void {
    if (this._destroyed) {
      if (!resource.destroyed && !resource.isGCIgnored) {
        resource.destroy(false);
      }
      return;
    }
    if (!this._associatedResources.has(resource)) {
      this._associatedResources.add(resource);
      resource._associationSuperResource(this);
    }
  }

  /**
   * @internal
   */
  _getAssociatedResources(): ReferResource[] {
    return Array.from(this._associatedResources);
  }

  protected override _onDestroy(): void {
    super._onDestroy();

    const { _sceneRoots: sceneRoots, _defaultSceneRoot: defaultSceneRoot, entities } = this;
    if (sceneRoots) {
      for (let i = 0, n = sceneRoots.length; i < n; i++) {
        const root = sceneRoots[i];
        if (root && !root.destroyed) {
          root.destroy();
        }
      }
    }
    if (defaultSceneRoot && !defaultSceneRoot.destroyed) {
      defaultSceneRoot.destroy();
    }
    if (entities) {
      for (let i = 0, n = entities.length; i < n; i++) {
        const entity = entities[i];
        if (entity && !entity.destroyed) {
          entity.destroy();
        }
      }
    }

    this._associatedResources.forEach((resource) => {
      resource._disassociationSuperResource(this);
    });
    this._associatedResources.clear();
  }

  /**
   * @deprecated
   * Entity after EntityParser.
   */
  entities: Entity[];

  /**
   * @deprecated
   * Camera after SceneParser.
   */
  cameras?: Camera[];

  /**
   * @deprecated
   * Export lights in extension KHR_lights_punctual.
   */
  lights?: Light[];

  /**
   * @deprecated Please use `instantiateSceneRoot` instead.
   * RootEntities after SceneParser.
   */
  get sceneRoots(): Entity[] {
    return this._sceneRoots;
  }

  /**
   * @deprecated Please use `instantiateSceneRoot` instead.
   * RootEntity after SceneParser.
   */
  get defaultSceneRoot(): Entity {
    return this._defaultSceneRoot;
  }
}
