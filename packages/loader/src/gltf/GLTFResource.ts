import {
  AnimationClip,
  Camera,
  Engine,
  Entity,
  Light,
  Material,
  ModelMesh,
  RefObject,
  Skin,
  Texture2D
} from "@galacean/engine-core";

/**
 * Product after GLTF parser, usually, `defaultSceneRoot` is only needed to use.
 */
export class GLTFResource extends RefObject {
  /** GLTF file url. */
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
  /** Export lights in extension KHR_lights_punctual */
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
   * @override
   */
  _onDestroy(): void {
    this.textures && ((this.textures.length = 0), (this.textures = null));
    this.materials && ((this.materials.length = 0), (this.materials = null));
    this.meshes && ((this.meshes.length = 0), (this.meshes = null));
    this.skins && ((this.skins.length = 0), (this.skins = null));
    this.animations && ((this.animations.length = 0), (this.animations = null));
    this.entities && ((this.entities.length = 0), (this.entities = null));
    this.cameras && ((this.cameras.length = 0), (this.cameras = null));
    this.lights && ((this.lights.length = 0), (this.lights = null));
    this.sceneRoots && ((this.sceneRoots.length = 0), (this.sceneRoots = null));
    this.defaultSceneRoot.destroy();
    this.defaultSceneRoot = null;
    this.extensionsData = null;
  }
}
