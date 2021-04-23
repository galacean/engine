import {
  Buffer,
  BufferBindFlag,
  BufferMesh,
  BufferUsage,
  IndexBufferBinding,
  IndexFormat,
  Material,
  PBRSpecularMaterial,
  SubMesh,
  TypedArray,
  UnlitMaterial,
  VertexElement
} from "@oasis-engine/core";
import { Vector3 } from "@oasis-engine/math";
import { GLTFResource } from "./GLTFResource";
import { BufferParser } from "./parser/BufferParser";
import { MaterialParser } from "./parser/MaterialParser";
import { MeshParser } from "./parser/MeshParser";
import { Parser } from "./parser/Parser";
import { TextureParser } from "./parser/TextureParser";
import { Validator } from "./parser/Validator";
import { createVertexElement, getIndexFormat, getVertexStride } from "./Util";

const TARGET_PATH_MAP = {
  translation: "position",
  rotation: "rotation",
  scale: "scale",
  weights: "weights"
};

/**
 * Extension dedicated registration key.
 */
export const HandledExtensions = {
  PBRMaterial: "PBRMaterial",
  KHR_lights: "KHR_lights",
  KHR_materials_unlit: "KHR_materials_unlit",
  KHR_materials_pbrSpecularGlossiness: "KHR_materials_pbrSpecularGlossiness",
  KHR_techniques_webgl: "KHR_techniques_webgl",
  KHR_draco_mesh_compression: "KHR_draco_mesh_compression"
};

let KHR_lights = null;

/**
 * Parse the glTF structure.
 * @param resource
 * @returns {*}
 * @private
 */
// export function parseGLTF2(data: LoadedGLTFResource, engine: Engine): Promise<GLTFResource> {
//   // Start processing glTF data.
//   const resources: GLTFParsed = {
//     engine,
//     gltf: data.gltf,
//     buffers: data.buffers,
//     asset: new GLTFResource(engine)
//   };
//   resources.asset.textures = data.textures;
//   resources.asset.meta = data.gltf;

//   if (resources.gltf.asset && resources.gltf.asset.version) {
//     resources.gltf.version = Number(resources.gltf.asset.version);
//     resources.gltf.isGltf2 = resources.gltf.version >= 2 && resources.gltf.version <= 3;
//   }

//   parseExtensions(resources);
//   // parse all related resources
//   return (
//     parseResources(resources, "materials", parseMaterial)
//       .then(() => parseResources(resources, "meshes", parseMesh))
//       // .then(() => parseResources(resources, "cameras", parseCamera))
//       .then(() => parseResources(resources, "nodes", parseNode))
//       .then(() => parseResources(resources, "scenes", parseScene))
//       .then(() => parseResources(resources, "skins", parseSkin))
//       .then(() => parseResources(resources, "animations", parseAnimation))
//       .then(() => buildSceneGraph(resources))
//   );
// }

/**
 * Parse skin.
 * @param gltfSkin
 * @param resources
 * @private
 */
// export function parseSkin(gltfSkin, resources) {
//   const { gltf, buffers } = resources;

//   const jointCount = gltfSkin.joints.length;

//   // FIXME: name is null
//   const skin = new Skin(gltfSkin.name);
//   // parse IBM
//   const accessor = gltf.accessors[gltfSkin.inverseBindMatrices];
//   const buffer = getAccessorData(gltf, accessor, buffers);
//   const MAT4_LENGTH = 16;

//   for (let i = 0; i < jointCount; i++) {
//     const startIdx = MAT4_LENGTH * i;
//     const endIdx = startIdx + MAT4_LENGTH;
//     skin.inverseBindMatrices[i] = new Matrix(...buffer.subarray(startIdx, endIdx));
//   }

//   // get joints
//   for (let i = 0; i < jointCount; i++) {
//     const node = getItemByIdx("nodes", gltfSkin.joints[i], resources);
//     skin.joints[i] = node.name;
//   }

//   // get skeleton
//   const node = getItemByIdx("nodes", gltfSkin.skeleton == null ? gltfSkin.joints[0] : gltfSkin.skeleton, resources);
//   skin.skeleton = node.name;

//   return Promise.resolve(skin);
// }

/**
 * Parse the node of glTF.
 * @param gltfNode
 * @param resources
 * @private
 */
// export function parseNode(gltfNode, resources: GLTFParsed) {
//   // TODO: undefined name?
//   const entity = new Entity(resources.engine, gltfNode.name || `GLTF_NODE_${nodeCount++}`);

//   if (gltfNode.hasOwnProperty("matrix")) {
//     const m = gltfNode.matrix;
//     const mat = new Matrix();
//     mat.setValueByArray(m);
//     const pos = new Vector3();
//     const scale = new Vector3(1, 1, 1);
//     const rot = new Quaternion();
//     mat.decompose(pos, rot, scale);

//     entity.transform.position = pos;
//     entity.transform.rotationQuaternion = rot;
//     entity.transform.scale = scale;
//   } else {
//     for (const key in TARGET_PATH_MAP) {
//       if (gltfNode.hasOwnProperty(key)) {
//         const mapKey = TARGET_PATH_MAP[key];
//         if (mapKey === "weights") {
//           entity[mapKey] = gltfNode[key];
//         } else {
//           const arr = gltfNode[key];
//           const len = arr.length;
//           const obj = entity[mapKey];
//           if (len === 2) {
//             obj.setValue(arr[0], arr[1]);
//           } else if (len === 3) {
//             obj.setValue(arr[0], arr[1], arr[2]);
//           } else if (len === 4) {
//             obj.setValue(arr[0], arr[1], arr[2], arr[3]);
//           }
//           entity[mapKey] = obj;
//         }
//       }
//     }
//   }

//   if (gltfNode.camera !== undefined) {
//     const cameraOptions = resources.gltf.cameras[gltfNode.camera];
//     const camera = entity.addComponent(Camera);
//     if (cameraOptions.type === "orthographic") {
//       camera.isOrthographic = true;
//       let { ymag, xmag, zfar, znear } = cameraOptions.orthographic;
//       if (znear !== undefined) {
//         camera.nearClipPlane = znear;
//       }
//       if (zfar !== undefined) {
//         camera.farClipPlane = zfar;
//       }
//       if (ymag && xmag) {
//         camera.orthographicSize = Math.max(ymag, xmag) / 2;
//       }
//       if (ymag !== undefined && xmag) {
//         camera.orthographicSize = xmag / 2;
//       }
//       if (xmag !== undefined && ymag) {
//         camera.orthographicSize = ymag / 2;
//       }
//     } else {
//       const { aspectRatio, yfov, zfar, znear } = cameraOptions.perspective;
//       if (aspectRatio !== undefined) {
//         camera.aspectRatio = aspectRatio;
//       }
//       if (yfov !== undefined) {
//         camera.fieldOfView = yfov;
//       }
//       if (zfar !== undefined) {
//         camera.farClipPlane = zfar;
//       }
//       if (znear !== undefined) {
//         camera.nearClipPlane = znear;
//       }
//     }
//   }

//   if (gltfNode.extensions) {
//     if (KHR_lights && gltfNode.extensions.KHR_lights) {
//       const lightIdx = gltfNode.extensions.KHR_lights.light;
//       if (lightIdx !== undefined) {
//         const light = getItemByIdx("lights", lightIdx, resources);
//         if (light) {
//           const lightCon = entity.addComponent(light.ability);
//           Object.assign(lightCon, light.props);
//         }
//       }
//     }
//   }

//   return Promise.resolve(entity);
// }

/**
 * parse the scene of glTF.
 * @param gltfScene
 * @param resources
 * @returns {{nodes: Array}}
 * @private
 */
// export function parseScene(gltfScene, resources) {
//   const sceneNodes = [];
//   for (let i = 0; i < gltfScene.nodes.length; i++) {
//     const node = getItemByIdx("nodes", gltfScene.nodes[i], resources);
//     sceneNodes.push(node);
//   }

//   if (gltfScene.extensions) {
//     if (KHR_lights && gltfScene.extensions.KHR_lights) {
//       const lightIdx = gltfScene.extensions.KHR_lights.light;
//       if (lightIdx !== undefined) {
//         const light = getItemByIdx("lights", lightIdx, resources);
//         if (light) sceneNodes[0].addComponent(light.ability, light.props);
//       }
//     }
//   }

//   return Promise.resolve({
//     nodes: sceneNodes
//   });
// }

/**
 * Construct scene graph and create Ability according to node configuration.
 * @param resources
 * @private
 */
// export function buildSceneGraph(resources: GLTFParsed): GLTFResource {
//   const { asset, gltf } = resources;

//   const gltfNodes = gltf.nodes || [];
//   const gltfMeshes = gltf.meshes;

//   asset.defaultScene = getItemByIdx("scenes", gltf.scene ?? 0, resources);

//   for (let i = gltfNodes.length - 1; i >= 0; i--) {
//     const gltfNode = gltfNodes[i];
//     const node = getItemByIdx("nodes", i, resources);

//     if (gltfNode.hasOwnProperty("children")) {
//       const children = gltfNode.children || [];
//       for (let j = children.length - 1; j >= 0; j--) {
//         const childNode = getItemByIdx("nodes", children[j], resources);

//         node.addChild(childNode);
//       }
//     }

//     // link mesh
//     if (gltfNode.hasOwnProperty("mesh")) {
//       const meshIndex = gltfNode.mesh;
//       node.meshIndex = meshIndex;
//       const gltfMeshPrimitives = gltfMeshes[meshIndex].primitives;
//       const meshes = <ModelMesh[]>getItemByIdx("meshes", meshIndex, resources);

//       for (let j = 0; j < meshes.length; j++) {
//         const mesh = meshes[j];
//         let renderer: MeshRenderer;
//         if (gltfNode.hasOwnProperty("skin") || mesh.hasOwnProperty("weights")) {
//           const skin = getItemByIdx("skins", gltfNode.skin, resources);
//           // const weights = mesh.weights;
//           const skinRenderer: SkinnedMeshRenderer = node.addComponent(SkinnedMeshRenderer);
//           skinRenderer.mesh = mesh;
//           skinRenderer.skin = skin;
//           // skinRenderer.setWeights(weights);
//           renderer = skinRenderer;
//         } else {
//           renderer = node.addComponent(MeshRenderer);
//           renderer.mesh = mesh;
//         }

//         const materialIndex = gltfMeshPrimitives[j].material;
//         const material =
//           materialIndex !== undefined
//             ? getItemByIdx("materials", materialIndex, resources)
//             : getDefaultMaterial(node.engine);
//         renderer.setMaterial(material);
//       }
//     }
//   }

//   //@ts-ignore
//   const nodes = asset.defaultScene.nodes;
//   if (nodes.length === 1) {
//     asset.defaultSceneRoot = nodes[0];
//   } else {
//     const rootNode = new Entity(resources.engine);
//     for (let i = 0; i < nodes.length; i++) {
//       rootNode.addChild(nodes[i]);
//     }
//     asset.defaultSceneRoot = rootNode;
//   }

//   const animator = asset.defaultSceneRoot.addComponent(Animation);
//   const animations = asset.animations;
//   if (animations) {
//     animations.forEach((clip: AnimationClip) => {
//       animator.addAnimationClip(clip, clip.name);
//     });
//   }
//   return resources.asset as GLTFResource;
// }

export class GLTFParser {
  private static _isPromise(value: any): boolean {
    return value && typeof value.then === "function";
  }

  private _pipeline: Parser[] = [];

  constructor(pipeline: (new () => Parser)[]) {
    pipeline.forEach((Pipe: new () => Parser, index: number) => {
      this._pipeline[index] = new Pipe();
    });
  }

  parse(context: GLTFResource): Promise<GLTFResource> {
    let lastPipeOutput: void | Promise<void> = void 0;

    return new Promise((resolve, reject) => {
      this._pipeline.forEach((parser: Parser) => {
        if (GLTFParser._isPromise(lastPipeOutput)) {
          lastPipeOutput = (lastPipeOutput as Promise<void>).then(() => {
            return parser.parse(context);
          });
        } else {
          lastPipeOutput = parser.parse(context);
        }
      });

      if (GLTFParser._isPromise(lastPipeOutput)) {
        (lastPipeOutput as Promise<void>)
          .then(() => {
            resolve(context);
          })
          .catch(reject);
      } else {
        resolve(context);
      }
    });
  }
}

export const gltfParser = new GLTFParser([BufferParser, Validator, TextureParser, MaterialParser, MeshParser]);
