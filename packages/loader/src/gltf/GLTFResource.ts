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
} from "@oasis-engine/core";

/**
 * Product after glTF parser, usually, `defaultSceneRoot` is only needed to use.
 */
export class GLTFResource extends EngineObject {
  /** glTF file url. */
  url: string;
  /** Oasis Texture2D after TextureParser. */
  textures?: Texture2D[];
  /** Oasis Material after MaterialParser. */
  materials?: Material[];
  /** Oasis ModelMesh after MeshParser. */
  meshes?: ModelMesh[][];
  /** Oasis Skin after SkinParser. */
  skins?: Skin[];
  /** Oasis AnimationClip after AnimationParser. */
  animations?: AnimationClip[];
  /** Oasis Entity after EntityParser. */
  entities: Entity[];
  /** Oasis Camera after SceneParser. */
  cameras?: Camera[];
  /** glTF can export lights in extension KHR_lights_punctual. */
  lights?: Light[];
  /** Oasis RootEntities after SceneParser. */
  sceneRoots: Entity[];
  /** Oasis RootEntity after SceneParser. */
  defaultSceneRoot: Entity;
  /** Extensions data. */
  extensionsData: Record<string, any>;

  constructor(engine: Engine, url: string) {
    super(engine);
    this.url = url;
  }

  /**
   * @override
   */
  protected _onDestroy(): void {
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
