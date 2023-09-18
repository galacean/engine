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
}
