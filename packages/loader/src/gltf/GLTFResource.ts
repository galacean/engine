import {
  AnimationClip,
  Camera,
  Engine,
  EngineObject,
  Entity,
  Light,
  Material,
  ModelMesh,
  Renderer,
  Skin,
  Texture2D
} from "@oasis-engine/core";

/**
 * Product after GLTF parser, usually, `defaultSceneRoot` is only needed to use.
 */
export class GLTFResource extends EngineObject {
  /** GLTF file url. */
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
  /** GLTF can export lights in extension KHR_lights_punctual */
  lights?: Light[];
  /** Oasis RootEntities after SceneParser. */
  sceneRoots: Entity[];
  /** Oasis RootEntity after SceneParser. */
  defaultSceneRoot: Entity;
  /** Renderer can replace material by `renderer.setMaterial` if gltf use plugin-in KHR_materials_variants. */
  variants?: { renderer: Renderer; material: Material; variants: string[] }[];

  constructor(engine: Engine, url: string) {
    super(engine);
    this.url = url;
  }

  /**
   * @override
   */
  destroy(): void {
    if (this._destroyed) {
      return;
    }

    super.destroy();
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
    this.variants = null;
  }
}
