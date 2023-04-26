import {
  AnimationClip,
  Camera,
  Engine,
  EngineObject,
  Entity,
  Light,
  Material,
  ModelMesh,
  Skin,
  Texture2D
} from "@galacean/engine-core";

/**
 * Product after glTF parser, usually, `defaultSceneRoot` is only needed to use.
 */
export class GLTFResource extends EngineObject {
  /** glTF file url. */
  url: string;
  /** Texture2D after TextureParser. */
  textures?: Texture2D[];
  /** Material after MaterialParser. */
  materials?: Material[];
  /** ModelMesh after MeshParser. */
  meshes?: ModelMesh[][];
  /** Skin after SkinParser. */
  skins?: Skin[];
  /** AnimationClip after AnimationParser. */
  animations?: AnimationClip[];
  /** Entity after EntityParser. */
  entities: Entity[];
  /** Camera after SceneParser. */
  cameras?: Camera[];
  /** Export lights in extension KHR_lights_punctual. */
  lights?: Light[];
  /** RootEntities after SceneParser. */
  sceneRoots: Entity[];
  /** RootEntity after SceneParser. */
  defaultSceneRoot: Entity;
  /** Extensions data. */
  extensionsData: Record<string, any>;

  constructor(engine: Engine, url: string) {
    super(engine);
    this.url = url;
  }

  /**
   * @internal
   */
  protected override _onDestroy(): void {
    super._onDestroy();
    this.defaultSceneRoot.destroy();

    this.textures = null;
    this.materials = null;
    this.meshes = null;
    this.skins = null;
    this.animations = null;
    this.entities = null;
    this.cameras = null;
    this.lights = null;
    this.sceneRoots = null;
    this.extensionsData = null;
  }
}
