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

  protected override _onDestroy(): void {
    super._onDestroy();

    const { textures, materials, meshes } = this;
    textures && this._disassociateResources(textures);
    materials && this._disassociateResources(materials);
    if (meshes) {
      for (let i = 0, n = meshes.length; i < n; i++) {
        const meshArr = meshes[i];
        meshArr && this._disassociateResources(meshArr);
      }
    }
  }

  private _disassociateResources(resources: ReferResource[]): void {
    for (let i = 0, n = resources.length; i < n; i++) {
      resources[i]?._disassociationSuperResource(this);
    }
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
