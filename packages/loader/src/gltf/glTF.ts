import {
  AlphaMode,
  Animation,
  AnimationClip,
  BlinnPhongMaterial,
  Buffer,
  BufferBindFlag,
  BufferUsage,
  Camera,
  Engine,
  EngineObject,
  Entity,
  IndexBufferBinding,
  IndexFormat,
  InterpolationType,
  Logger,
  Material,
  Mesh,
  MeshRenderer,
  PBRMaterial,
  PBRSpecularMaterial,
  Primitive,
  PrimitiveTopology,
  Scene,
  Skin,
  SkinnedMeshRenderer,
  SubPrimitive,
  Texture2D,
  TypedArray,
  UnlitMaterial,
  VertexElement
} from "@oasis-engine/core";
import { Color, Matrix, Quaternion, Vector3 } from "@oasis-engine/math";
import { LoadedGLTFResource } from "../GLTF";
import { glTFDracoMeshCompression } from "./glTFDracoMeshCompression";
import { createVertexElement, getAccessorData, getAccessorTypeSize, getIndexFormat, getVertexStride } from "./Util";

// KHR_lights:  https://github.com/MiiBond/glTF/tree/khr_lights_v1/extensions/2.0/Khronos/KHR_lights
//              https://github.com/KhronosGroup/glTF/pull/1223
//              https://github.com/KhronosGroup/glTF/issues/945
// KHR_materials_common:  https://github.com/donmccurdy/glTF/tree/donmccurdy-KHR_materials_common/extensions/Khronos/KHR_materials_common_v2
//                        https://github.com/KhronosGroup/glTF/pull/1150
//                        https://github.com/KhronosGroup/glTF/issues/947

const TARGET_PATH_MAP = {
  translation: "position",
  rotation: "rotation",
  scale: "scale",
  weights: "weights"
};

let nodeCount = 0;

const RegistedObjs = {};
const RegistedCustomMaterials = {};

const getDefaultMaterial = (function () {
  // let defaultMateril: BlinnPhongMaterial;
  return (engine: Engine) => {
    // if (!defaultMateril) {
    let defaultMateril: BlinnPhongMaterial = new BlinnPhongMaterial(engine);
    defaultMateril.emissiveColor = new Color(0.749, 0.749, 0.749, 1);
    // }
    return defaultMateril;
  };
})();

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

const extensionParsers = {
  KHR_lights: KHR_lights,
  KHR_materials_unlit: UnlitMaterial,
  KHR_materials_pbrSpecularGlossiness: PBRSpecularMaterial,
  KHR_techniques_webgl: Material,
  KHR_draco_mesh_compression: glTFDracoMeshCompression
};

/**
 * Register extension components to glTF loader.
 * @param extobj - Need to add extensions
 */
export function RegistExtension(extobj) {
  Object.keys(extobj).forEach((name) => {
    if (RegistedObjs[name] === undefined) {
      RegistedObjs[name] = extobj[name];

      switch (name) {
        case HandledExtensions.KHR_lights:
          KHR_lights = extobj[name];
          extensionParsers.KHR_lights = KHR_lights;
          break;
        default:
          if (Material.isPrototypeOf(extobj[name]) && extobj[name].TECH_NAME)
            RegistedCustomMaterials[extobj[name].TECH_NAME] = extobj[name];
          break;
      }
    }
  });
}

export interface GLTFParsed extends LoadedGLTFResource {
  asset: Partial<GLTFResource>;
  engine?: Engine;
}

export class GLTFResource extends EngineObject {
  defaultSceneRoot: Entity;
  defaultScene: Scene;
  scenes: Scene[];
  textures?: Texture2D[];
  animations?: AnimationClip[];
  materials?: Material[];
  meshes?: Mesh[];
  skins?: Skin[];
  cameras?: Camera[];
  meta: any;
}

/**
 * Parse the glTF structure.
 * @param resource
 * @returns {*}
 * @private
 */
export function parseGLTF(data: LoadedGLTFResource, engine: Engine): Promise<GLTFResource> {
  // Start processing glTF data.
  const resources: GLTFParsed = {
    engine,
    gltf: data.gltf,
    buffers: data.buffers,
    asset: new GLTFResource(engine)
  };
  resources.asset.textures = data.textures;
  resources.asset.meta = data.gltf;

  if (resources.gltf.asset && resources.gltf.asset.version) {
    resources.gltf.version = Number(resources.gltf.asset.version);
    resources.gltf.isGltf2 = resources.gltf.version >= 2 && resources.gltf.version <= 3;
  }

  parseExtensions(resources);
  // parse all related resources
  return (
    parseResources(resources, "materials", parseMaterial)
      .then(() => parseResources(resources, "meshes", parseMesh))
      // .then(() => parseResources(resources, "cameras", parseCamera))
      .then(() => parseResources(resources, "nodes", parseNode))
      .then(() => parseResources(resources, "scenes", parseScene))
      .then(() => parseResources(resources, "skins", parseSkin))
      .then(() => parseResources(resources, "animations", parseAnimation))
      .then(() => buildSceneGraph(resources))
  );
}

function parseExtensions(resources) {
  const { gltf, asset } = resources;
  const { extensions, extensionsUsed, extensionsRequired } = gltf;
  if (extensionsUsed) {
    Logger.info("extensionsUsed: ", extensionsUsed);
    for (let i = 0; i < extensionsUsed.length; i++) {
      if (Object.keys(extensionParsers).indexOf(extensionsUsed[i]) > -1) {
        if (!extensionParsers[extensionsUsed[i]]) {
          Logger.warn("extension " + extensionsUsed[i] + " is used, you can add this extension into gltf");
        }
      } else {
        Logger.warn("extensionsUsed has unsupported extension " + extensionsUsed[i]);
      }
    }
  }

  if (extensionsRequired) {
    Logger.info(`extensionsRequired: ${extensionsRequired}`);
    for (let i = 0; i < extensionsRequired.length; i++) {
      if (
        Object.keys(extensionParsers).indexOf(extensionsRequired[i]) < 0 ||
        !extensionParsers[extensionsRequired[i]]
      ) {
        Logger.error(`model has not supported required extension ${extensionsRequired[i]}`);
      }
      if (extensionsRequired[i] === HandledExtensions.KHR_draco_mesh_compression) {
        extensionParsers.KHR_draco_mesh_compression.init();
      }
    }
  }

  if (extensions) {
    if (KHR_lights && extensions.KHR_lights) {
      asset.lights = KHR_lights.parseLights(extensions.KHR_lights.lights);
    }
  }
}

/**
 * General resource analysis method.
 * @param resources - Existing resources
 * @param name - Name
 * @param handler - Resource resolver
 * @private
 */
function parseResources(resources: GLTFParsed, name: string, handler) {
  const { gltf, asset } = resources;
  if (!asset[name]) {
    asset[name] = [];
  }
  if (gltf.hasOwnProperty(name)) {
    const entities = gltf[name] || [];
    Logger.debug(name + ":", entities);
    const promises = [];
    for (let i = entities.length - 1; i >= 0; i--) {
      promises.push(handler(entities[i], resources));
    }
    return Promise.all(promises).then((results) => {
      for (let i = 0; i < results.length; i++) {
        asset[name].push(results[i]);
      }
    });
  }
  return Promise.resolve();
}

/**
 * Parse material.
 * @param gltfMaterial
 * @param resources
 * @private
 */
export function parseMaterial(gltfMaterial, resources) {
  const { gltf, engine } = resources;
  if (gltf.isGltf2 && typeof gltfMaterial.technique === "undefined") {
    const {
      extensions = {},
      pbrMetallicRoughness,
      normalTexture,
      emissiveTexture,
      emissiveFactor,
      occlusionTexture,
      alphaMode,
      alphaCutoff,
      doubleSided
    } = gltfMaterial;

    const isUnlit = extensions.KHR_materials_unlit;
    const isSpecular = extensions.KHR_materials_pbrSpecularGlossiness;

    let material: UnlitMaterial | PBRMaterial | PBRSpecularMaterial = null;
    if (isUnlit) {
      material = new UnlitMaterial(engine);
    } else if (isSpecular) {
      material = new PBRSpecularMaterial(engine);
    } else {
      material = new PBRMaterial(engine);
    }

    // render states
    material.doubleSided = doubleSided;
    switch (alphaMode) {
      case "OPAQUE":
        material.alphaMode = AlphaMode.Opaque;
        break;
      case "BLEND":
        material.alphaMode = AlphaMode.Blend;
        break;
      case "MASK":
        material.alphaMode = AlphaMode.CutOff;
        (material as PBRMaterial | PBRSpecularMaterial).alphaCutoff = alphaCutoff === undefined ? 0.5 : alphaCutoff;
        break;
    }

    // may be applied to unlit too.
    if (pbrMetallicRoughness) {
      const {
        baseColorFactor,
        baseColorTexture,
        metallicFactor,
        roughnessFactor,
        metallicRoughnessTexture
      } = pbrMetallicRoughness;
      if (baseColorTexture) {
        material.baseColorTexture = getItemByIdx("textures", baseColorTexture.index || 0, resources, false);
      }
      if (baseColorFactor) {
        material.baseColor = new Color(...baseColorFactor);
      }
      if (!isUnlit) {
        material = material as PBRMaterial;
        material.metallicFactor = metallicFactor !== undefined ? metallicFactor : 1;
        material.roughnessFactor = roughnessFactor !== undefined ? roughnessFactor : 1;
        if (metallicRoughnessTexture) {
          material.metallicRoughnessTexture = getItemByIdx(
            "textures",
            metallicRoughnessTexture.index || 0,
            resources,
            false
          );
        }
      }
    }

    // break unlit at here, unlit don't need to process the next code
    if (isUnlit) {
      return Promise.resolve(material);
    }
    material = material as PBRMaterial | PBRSpecularMaterial;

    if (emissiveTexture) {
      material.emissiveTexture = getItemByIdx("textures", emissiveTexture.index || 0, resources, false);
    }

    if (emissiveFactor) {
      material.emissiveColor = new Color(...emissiveFactor);
    }

    if (normalTexture) {
      const { index, texCoord, scale } = normalTexture;
      material = material as PBRMaterial | PBRSpecularMaterial;
      material.normalTexture = getItemByIdx("textures", index || 0, resources, false);

      if (typeof scale !== undefined) {
        material.normalScale = scale;
      }
    }

    if (occlusionTexture) {
      material = material as PBRMaterial | PBRSpecularMaterial;
      material.occlusionTexture = getItemByIdx("textures", occlusionTexture.index || 0, resources, false);

      if (occlusionTexture.strength !== undefined) {
        material.occlusionStrength = occlusionTexture.strength;
      }
    }

    if (isSpecular) {
      const {
        diffuseFactor,
        diffuseTexture,
        specularFactor,
        glossinessFactor,
        specularGlossinessTexture
      } = extensions.KHR_materials_pbrSpecularGlossiness;
      material = material as PBRSpecularMaterial;
      if (diffuseFactor) {
        material.baseColor = new Color(...diffuseFactor);
      }
      if (diffuseTexture) {
        material.baseColorTexture = getItemByIdx("textures", diffuseTexture.index || 0, resources, false);
      }
      if (specularFactor) {
        material.specularColor = new Color(...specularFactor);
      }
      if (glossinessFactor !== undefined) {
        material.glossinessFactor = glossinessFactor;
      }
      if (specularGlossinessTexture) {
        material.specularGlossinessTexture = getItemByIdx(
          "textures",
          specularGlossinessTexture.index || 0,
          resources,
          false
        );
      }
    }
    return Promise.resolve(material);
  } else {
    const techniqueName = gltfMaterial.technique;
    Logger.warn("Deprecated: Please use a model that meets the glTF 2.0 specification");
    // TODO: support KHR_UNLIT_MATERIAL in the future.
    if (techniqueName === "Texture") {
      const material = new UnlitMaterial(engine);
      const index = gltfMaterial.values._MainTex[0];
      material.baseColorTexture = getItemByIdx("textures", index || 0, resources, false);
      return Promise.resolve(material);
    }
  }
  return Promise.resolve();
}

/**
 * Parse skin.
 * @param gltfSkin
 * @param resources
 * @private
 */
export function parseSkin(gltfSkin, resources) {
  const { gltf, buffers } = resources;

  const jointCount = gltfSkin.joints.length;

  // FIXME: name is null
  const skin = new Skin(gltfSkin.name);
  // parse IBM
  const accessor = gltf.accessors[gltfSkin.inverseBindMatrices];
  const buffer = getAccessorData(gltf, accessor, buffers);
  const MAT4_LENGTH = 16;

  for (let i = 0; i < jointCount; i++) {
    const startIdx = MAT4_LENGTH * i;
    const endIdx = startIdx + MAT4_LENGTH;
    skin.inverseBindMatrices[i] = new Matrix(...buffer.subarray(startIdx, endIdx));
  }

  // get joints
  for (let i = 0; i < jointCount; i++) {
    const node = getItemByIdx("nodes", gltfSkin.joints[i], resources);
    skin.joints[i] = node.name;
  }

  // get skeleton
  const node = getItemByIdx("nodes", gltfSkin.skeleton == null ? gltfSkin.joints[0] : gltfSkin.skeleton, resources);
  skin.skeleton = node.name;

  return Promise.resolve(skin);
}

function parsePrimitiveVertex(
  mesh: Mesh,
  primitive: Primitive,
  primitiveGroup: SubPrimitive,
  gltfPrimitive,
  gltf,
  getVertexBufferData: (string) => TypedArray,
  getIndexBufferData: () => TypedArray,
  engine
) {
  // load vertices
  let i = 0;
  const vertexElements: VertexElement[] = [];
  let vertexCount: number;
  for (const attributeSemantic in gltfPrimitive.attributes) {
    const accessorIdx = gltfPrimitive.attributes[attributeSemantic];
    const accessor = gltf.accessors[accessorIdx];
    const stride = getVertexStride(accessor);
    const vertexELement = createVertexElement(gltf, attributeSemantic, accessor, i);

    vertexElements.push(vertexELement);
    const bufferData = getVertexBufferData(attributeSemantic);
    const vertexBuffer = new Buffer(engine, BufferBindFlag.VertexBuffer, bufferData.byteLength, BufferUsage.Static);
    vertexBuffer.setData(bufferData);
    primitive.setVertexBufferBinding(vertexBuffer, stride, i++);

    // compute bounds
    if (vertexELement.semantic == "POSITION") {
      const position = new Vector3();
      vertexCount = bufferData.length / 3;
      const { min, max } = mesh.bounds;
      for (let i = 0; i < vertexCount; i++) {
        const offset = i * 3;
        position.setValue(bufferData[offset], bufferData[offset + 1], bufferData[offset + 2]);
        Vector3.min(min, position, min);
        Vector3.max(max, position, max);
      }
    }
  }
  primitive.setVertexElements(vertexElements);

  // load indices
  const indices = gltfPrimitive.indices;
  if (indices) {
    const indexAccessor = gltf.accessors[indices];
    const indexData = getIndexBufferData();

    const indexCount = indexAccessor.count;
    const indexFormat = getIndexFormat(indexAccessor.componentType);
    const indexByteSize = indexFormat == IndexFormat.UInt32 ? 4 : indexFormat == IndexFormat.UInt16 ? 2 : 1;
    const indexBuffer = new Buffer(engine, BufferBindFlag.IndexBuffer, indexCount * indexByteSize, BufferUsage.Static);

    indexBuffer.setData(indexData);
    primitive.setIndexBufferBinding(new IndexBufferBinding(indexBuffer, indexFormat));
    primitiveGroup.start = 0;
    primitiveGroup.count = indexCount;
  } else {
    primitiveGroup.start = 0;
    primitiveGroup.count = vertexCount;
  }

  return Promise.resolve(primitive);
}

function parserPrimitiveTarget(primitive, gltfPrimitive, gltf, buffers) {}

/**
 * Parse Mesh
 * @param gltfMesh
 * @param resources
 * @private
 */
export function parseMesh(gltfMesh, resources) {
  const { gltf, buffers, engine } = resources;

  const mesh = new Mesh(gltfMesh.name);
  // mesh.type = resources.assetType;
  // parse all primitives then link to mesh
  // TODO: use hash cached primitives
  const primitivePromises = [];
  const groups = [];
  for (let i = 0; i < gltfMesh.primitives.length; i++) {
    primitivePromises.push(
      new Promise((resolve, reject) => {
        const gltfPrimitive = gltfMesh.primitives[i];
        // FIXME: use index as primitive's name
        const primitive = new Primitive(engine, gltfPrimitive.name || gltfMesh.name || i);
        const subPrimitive = new SubPrimitive();
        groups.push(subPrimitive);
        // primitive.type = resources.assetType;
        subPrimitive.topology = gltfPrimitive.mode == null ? PrimitiveTopology.Triangles : gltfPrimitive.mode;
        if (gltfPrimitive.hasOwnProperty("targets")) {
          primitive.targets = [];
          (mesh as any).weights = gltfMesh.weights || new Array(gltfPrimitive.targets.length).fill(0);
        }
        let vertexPromise;
        if (gltfPrimitive.extensions && gltfPrimitive.extensions[HandledExtensions.KHR_draco_mesh_compression]) {
          const extensionParser = extensionParsers.KHR_draco_mesh_compression;
          const extension = gltfPrimitive.extensions[HandledExtensions.KHR_draco_mesh_compression];
          vertexPromise = extensionParser.parse(extension, gltfPrimitive, gltf, buffers).then((decodedGeometry) => {
            return parsePrimitiveVertex(
              mesh,
              primitive,
              subPrimitive,
              gltfPrimitive,
              gltf,
              (attributeSemantic) => {
                for (let i = 0; i < decodedGeometry.attributes.length; i++) {
                  if (decodedGeometry.attributes[i].name === attributeSemantic) {
                    return decodedGeometry.attributes[i].array;
                  }
                }
                return null;
              },
              () => {
                return decodedGeometry.index.array;
              },
              resources.engine
            );
          });
        } else {
          vertexPromise = parsePrimitiveVertex(
            mesh,
            primitive,
            subPrimitive,
            gltfPrimitive,
            gltf,
            (attributeSemantic) => {
              const accessorIdx = gltfPrimitive.attributes[attributeSemantic];
              const accessor = gltf.accessors[accessorIdx];
              return getAccessorData(gltf, accessor, buffers);
            },
            () => {
              const indexAccessor = gltf.accessors[gltfPrimitive.indices];
              return getAccessorData(gltf, indexAccessor, buffers);
            },
            resources.engine
          );
        }
        vertexPromise
          .then((processedPrimitive) => {
            parserPrimitiveTarget(processedPrimitive, gltfPrimitive, gltf, buffers);
            resolve(processedPrimitive);
          })
          .catch((e) => {
            reject(e);
          });
      })
    );
  }
  return Promise.all(primitivePromises).then((primitives: Primitive[]) => {
    for (let i = 0; i < primitives.length; i++) {
      mesh.primitives.push(primitives[i]);
      mesh.groups.push(groups[i]);
    }
    return mesh;
  });
}

/**
 * Parse Animation.
 * @param gltfAnimation
 * @param resources
 * @returns {*}
 * @private
 */
export function parseAnimation(gltfAnimation, resources) {
  const { gltf, buffers } = resources;
  const gltfSamplers = gltfAnimation.samplers || [];
  const gltfChannels = gltfAnimation.channels || [];

  const animationIdx = gltf.animations.indexOf(gltfAnimation);
  const animationClip = new AnimationClip(gltfAnimation.name || `Animation${animationIdx}`);

  let duration = -1;
  let durationIndex = -1;
  // parse samplers
  for (let i = 0; i < gltfSamplers.length; i++) {
    const gltfSampler = gltfSamplers[i];
    // input
    const inputAccessor = gltf.accessors[gltfSampler.input];
    const outputAccessor = gltf.accessors[gltfSampler.output];
    const input = getAccessorData(gltf, inputAccessor, buffers);
    const output = getAccessorData(gltf, outputAccessor, buffers);
    let outputAccessorSize = getAccessorTypeSize(outputAccessor.type);
    if (outputAccessorSize * input.length !== output.length) outputAccessorSize = output.length / input.length;

    // TODO: support
    // LINEAR, STEP, CUBICSPLINE
    let samplerInterpolation = InterpolationType.LINEAR;
    switch (gltfSampler.interpolation) {
      case "CUBICSPLINE":
        samplerInterpolation = InterpolationType.CUBICSPLINE;
        break;
      case "STEP":
        samplerInterpolation = InterpolationType.STEP;
        break;
    }
    const maxTime = input[input.length - 1];
    if (maxTime > duration) {
      duration = maxTime;
      durationIndex = i;
    }
    animationClip.addSampler(input, output, outputAccessorSize, samplerInterpolation);
  }

  animationClip.durationIndex = durationIndex;
  animationClip.duration = duration;

  for (let i = 0; i < gltfChannels.length; i++) {
    const gltfChannel = gltfChannels[i];
    const target = gltfChannel.target;
    const samplerIndex = gltfChannel.sampler;
    const targetNode = getItemByIdx("nodes", target.node, resources);
    const targetPath = TARGET_PATH_MAP[target.path];

    animationClip.addChannel(samplerIndex, targetNode.name, targetPath);
  }

  return Promise.resolve(animationClip);
}

/**
 * Parse the node of glTF.
 * @param gltfNode
 * @param resources
 * @private
 */
export function parseNode(gltfNode, resources: GLTFParsed) {
  // TODO: undefined name?
  const entity = new Entity(resources.engine, gltfNode.name || `GLTF_NODE_${nodeCount++}`);

  if (gltfNode.hasOwnProperty("matrix")) {
    const m = gltfNode.matrix;
    const mat = new Matrix();
    mat.setValueByArray(m);
    const pos = new Vector3();
    const scale = new Vector3(1, 1, 1);
    const rot = new Quaternion();
    mat.decompose(pos, rot, scale);

    entity.transform.position = pos;
    entity.transform.rotationQuaternion = rot;
    entity.transform.scale = scale;
  } else {
    for (const key in TARGET_PATH_MAP) {
      if (gltfNode.hasOwnProperty(key)) {
        const mapKey = TARGET_PATH_MAP[key];
        if (mapKey === "weights") {
          entity[mapKey] = gltfNode[key];
        } else {
          const arr = gltfNode[key];
          const len = arr.length;
          const obj = entity[mapKey];
          if (len === 2) {
            obj.setValue(arr[0], arr[1]);
          } else if (len === 3) {
            obj.setValue(arr[0], arr[1], arr[2]);
          } else if (len === 4) {
            obj.setValue(arr[0], arr[1], arr[2], arr[3]);
          }
          entity[mapKey] = obj;
        }
      }
    }
  }

  if (gltfNode.camera !== undefined) {
    const cameraOptions = resources.gltf.cameras[gltfNode.camera];
    const camera = entity.addComponent(Camera);
    if (cameraOptions.type === "orthographic") {
      camera.isOrthographic = true;
      let { ymag, xmag, zfar, znear } = cameraOptions.orthographic;
      if (znear !== undefined) {
        camera.nearClipPlane = znear;
      }
      if (zfar !== undefined) {
        camera.farClipPlane = zfar;
      }
      if (ymag && xmag) {
        camera.orthographicSize = Math.max(ymag, xmag) / 2;
      }
      if (ymag !== undefined && xmag) {
        camera.orthographicSize = xmag / 2;
      }
      if (xmag !== undefined && ymag) {
        camera.orthographicSize = ymag / 2;
      }
    } else {
      const { aspectRatio, yfov, zfar, znear } = cameraOptions.perspective;
      if (aspectRatio !== undefined) {
        camera.aspectRatio = aspectRatio;
      }
      if (yfov !== undefined) {
        camera.fieldOfView = yfov;
      }
      if (zfar !== undefined) {
        camera.farClipPlane = zfar;
      }
      if (znear !== undefined) {
        camera.nearClipPlane = znear;
      }
    }
  }

  if (gltfNode.extensions) {
    if (KHR_lights && gltfNode.extensions.KHR_lights) {
      const lightIdx = gltfNode.extensions.KHR_lights.light;
      if (lightIdx !== undefined) {
        const light = getItemByIdx("lights", lightIdx, resources);
        if (light) {
          const lightCon = entity.addComponent(light.ability);
          Object.assign(lightCon, light.props);
        }
      }
    }
  }

  return Promise.resolve(entity);
}

/**
 * parse the scene of glTF.
 * @param gltfScene
 * @param resources
 * @returns {{nodes: Array}}
 * @private
 */
export function parseScene(gltfScene, resources) {
  const sceneNodes = [];
  for (let i = 0; i < gltfScene.nodes.length; i++) {
    const node = getItemByIdx("nodes", gltfScene.nodes[i], resources);
    sceneNodes.push(node);
  }

  if (gltfScene.extensions) {
    if (KHR_lights && gltfScene.extensions.KHR_lights) {
      const lightIdx = gltfScene.extensions.KHR_lights.light;
      if (lightIdx !== undefined) {
        const light = getItemByIdx("lights", lightIdx, resources);
        if (light) sceneNodes[0].addComponent(light.ability, light.props);
      }
    }
  }

  return Promise.resolve({
    nodes: sceneNodes
  });
}

/**
 * Get content through index.
 * @param name
 * @param idx
 * @param resources
 * @returns {*}
 * @private
 */
export function getItemByIdx(name, idx, resources, inverse: boolean = true) {
  const { asset } = resources;

  const itemIdx = inverse ? asset[name].length - idx - 1 : idx;
  return asset[name][itemIdx];
}

/**
 * Construct scene graph and create Ability according to node configuration.
 * @param resources
 * @private
 */
export function buildSceneGraph(resources: GLTFParsed): GLTFResource {
  const { asset, gltf } = resources;

  const gltfNodes = gltf.nodes || [];
  const gltfMeshes = gltf.meshes;

  asset.defaultScene = getItemByIdx("scenes", gltf.scene ?? 0, resources);

  for (let i = gltfNodes.length - 1; i >= 0; i--) {
    const gltfNode = gltfNodes[i];
    const node = getItemByIdx("nodes", i, resources);

    if (gltfNode.hasOwnProperty("children")) {
      const children = gltfNode.children || [];
      for (let j = children.length - 1; j >= 0; j--) {
        const childNode = getItemByIdx("nodes", children[j], resources);

        node.addChild(childNode);
      }
    }

    // link mesh
    if (gltfNode.hasOwnProperty("mesh")) {
      const meshIndex = gltfNode.mesh;
      node.meshIndex = meshIndex;
      const gltfMeshPrimitives = gltfMeshes[meshIndex].primitives;
      const mesh = getItemByIdx("meshes", meshIndex, resources);

      let renderer: MeshRenderer;
      if (gltfNode.hasOwnProperty("skin") || mesh.hasOwnProperty("weights")) {
        const skin = getItemByIdx("skins", gltfNode.skin, resources);
        const weights = mesh.weights;
        const skinRenderer: SkinnedMeshRenderer = node.addComponent(SkinnedMeshRenderer);
        skinRenderer.mesh = mesh;
        skinRenderer.skin = skin;
        skinRenderer.setWeights(weights);
        renderer = skinRenderer;
      } else {
        renderer = node.addComponent(MeshRenderer);
        renderer.mesh = mesh;
      }
      for (let j = 0, m = gltfMeshPrimitives.length; j < m; j++) {
        const materialIndex = gltfMeshPrimitives[j].material;
        mesh.primitives[j].materialIndex = materialIndex;
        const material =
          materialIndex !== undefined
            ? getItemByIdx("materials", materialIndex, resources)
            : getDefaultMaterial(node.engine);
        renderer.setSharedMaterial(j, material);
      }
    }
  }

  //@ts-ignore
  const nodes = asset.defaultScene.nodes;
  if (nodes.length === 1) {
    asset.defaultSceneRoot = nodes[0];
  } else {
    const rootNode = new Entity(resources.engine);
    for (let i = 0; i < nodes.length; i++) {
      rootNode.addChild(nodes[i]);
    }
    asset.defaultSceneRoot = rootNode;
  }

  const animator = asset.defaultSceneRoot.addComponent(Animation);
  const animations = asset.animations;
  if (animations) {
    animations.forEach((clip: AnimationClip) => {
      animator.addAnimationClip(clip, clip.name);
    });
  }
  return resources.asset as GLTFResource;
}
