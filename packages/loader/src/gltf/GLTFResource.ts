import {
  AnimationClip,
  Camera,
  Engine,
  Entity,
  Light,
  Material,
  ModelMesh,
  RefObject,
  Renderer,
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
  /** Renderer can replace material by `renderer.setMaterial` if gltf use plugin-in KHR_materials_variants. */
  variants?: { renderer: Renderer; material: Material; variants: string[] }[];

  constructor(engine: Engine, url: string) {
    super(engine);
    this.url = url;
  }

  /**
   * @internal
   */
  _onDestroy(): void {}
}
