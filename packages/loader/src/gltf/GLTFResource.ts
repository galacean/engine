import {
  AnimationClip,
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
 * Product after glTF parser, usually, `defaultSceneRoot` is only needed to use.
 */
export class GLTFResource extends ReferResource {
  /** glTF file url. */
  readonly url: string;
  /** Texture2D after TextureParser. */
  readonly textures?: Texture2D[];
  /** Material after MaterialParser. */
  readonly materials?: Material[];
  /** ModelMesh after MeshParser. */
  readonly meshes?: ModelMesh[][];
  /** Skin after SkinParser. */
  readonly skins?: Skin[];
  /** AnimationClip after AnimationParser. */
  readonly animations?: AnimationClip[];

  /** @internal */
  _defaultSceneRoot: Entity;
  /** @internal */
  _extensionsData: Record<string, any>;

  private _sceneRoots: Entity[];

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
   * Instantiate scene root entity.
   * @param sceneIndex - Scene index
   * @returns Root entity
   */
  instantiateSceneRoot(sceneIndex?: number): Entity {
    const sceneRoot = sceneIndex === undefined ? this._defaultSceneRoot : this._sceneRoots[sceneIndex];
    return sceneRoot.clone();
  }

  protected override _onDestroy(): void {
    super._onDestroy();
    const { textures, materials, meshes } = this;
    if (textures) {
      for (let i = 0, n = textures.length; i < n; i++) {
        // @ts-ignore
        textures[i]._disassociationSuperResource(this);
      }
      if (materials) {
        for (let i = 0, n = materials.length; i < n; i++) {
          // @ts-ignore
          materials[i]._disassociationSuperResource(this);
        }
      }
      if (meshes) {
        for (let i = 0, n = meshes.length; i < n; i++) {
          for (let j = 0, m = meshes[i].length; j < m; j++) {
            // @ts-ignore
            meshes[i][j]._disassociationSuperResource(this);
          }
        }
      }
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
   * @deprecated
   * RootEntities after SceneParser.
   */
  get sceneRoots(): Entity[] {
    return this._sceneRoots;
  }

  /**
   * @deprecated
   * RootEntity after SceneParser.
   */
  get defaultSceneRoot(): Entity {
    return this._defaultSceneRoot;
  }
}
