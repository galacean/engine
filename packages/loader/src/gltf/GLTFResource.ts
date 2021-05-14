import {
  AnimationClip,
  BufferMesh,
  Camera,
  EngineObject,
  Entity,
  Light,
  Material,
  Renderer,
  Skin,
  Texture2D
} from "@oasis-engine/core";
import { IGLTF } from "./Schema";

/**
 * Product after GLTF parser, usually, `defaultSceneRoot` is only needed to use.
 */
export class GLTFResource extends EngineObject {
  /** GLTF file url. */
  url: string;
  /** GLTF file content. */
  gltf: IGLTF;
  /** ArrayBuffer after BufferParser. */
  buffers: ArrayBuffer[];
  /** Oasis Texture2D after TextureParser. */
  textures?: Texture2D[];
  /** Oasis Material after MaterialParser. */
  materials?: Material[];
  /** Oasis BufferMesh after MeshParser. */
  meshes?: BufferMesh[][];
  /** Oasis Skin after SkinParser. */
  skins?: Skin[];
  /** Oasis AnimationClip after AnimationParser. */
  animations?: AnimationClip[];
  /** Oasis Entity after EntityParser. */
  entities: Entity[];
  /** Oasis Camera after SceneParser. */
  cameras?: Array<{ entity: Entity; camera: Camera }>;
  /** GLTF can export lights in extension KHR_lights_punctual */
  lights?: Array<{ entity: Entity; light: Light }>;
  /** Oasis RootEntities after SceneParser. */
  sceneRoots: Entity[];
  /** Oasis RootEntity after SceneParser. */
  defaultSceneRoot: Entity;
  /** Renderer can replace material by `renderer.setMaterial` if gltf use plugin-in KHR_materials_variants. */
  variants?: Array<{ renderer: Renderer; material: Material; variants: string[] }>;
}
