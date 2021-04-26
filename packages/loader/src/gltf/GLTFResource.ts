import { AnimationClip, BufferMesh, EngineObject, Entity, Material, Skin, Texture2D } from "@oasis-engine/core";
import { IGLTF } from "./schema";

export class GLTFResource extends EngineObject {
  url: string;
  gltf: IGLTF;
  buffers: ArrayBuffer[];
  textures?: Texture2D[];
  materials?: Material[];
  meshes?: BufferMesh[][];

  skins?: Skin[];
  animations?: AnimationClip[];
  entities: Entity[];

  sceneRoots: Entity[];
  defaultSceneRoot: Entity;
}
