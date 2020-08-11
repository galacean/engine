import { Logger, Util, DrawMode, DataType, EngineObject } from "@alipay/o3-core";
import { Entity, Scene, Engine } from "@alipay/o3-core";
import { Texture2D, Material } from "@alipay/o3-material";
import { ConstantMaterial } from "@alipay/o3-mobile-material";
import { Primitive } from "@alipay/o3-primitive";
import { Mesh, Skin, MeshRenderer, SkinnedMeshRenderer } from "@alipay/o3-mesh";
import { Vector3, Matrix, Quaternion, Vector4, Vector2 } from "@alipay/o3-math";
import { getAccessorData, getAccessorTypeSize, createAttribute, findByKeyValue } from "./Util";
import { AnimationClip, InterpolationType, Animation } from "@alipay/o3-animation";

import { glTFDracoMeshCompression } from "./glTFDracoMeshCompression";

import { PBRMaterial } from "@alipay/o3-pbr";
import { LoadedGLTFResource } from "../GLTF";

// 踩在浪花儿上
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
  let defaultMateril: ConstantMaterial;
  return () => {
    if (!defaultMateril) {
      defaultMateril = new ConstantMaterial("default");
      defaultMateril.emission = new Vector4(0.749, 0.749, 0.749, 1);
    }
    return defaultMateril;
  };
})();

/**
 * 扩展专用注册键值
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
  KHR_materials_unlit: PBRMaterial, // Also have other materials
  KHR_materials_pbrSpecularGlossiness: PBRMaterial,
  KHR_techniques_webgl: Material,
  KHR_draco_mesh_compression: glTFDracoMeshCompression
};

/**
 * 注册扩展组件到 glTF loader
 * @param {Object} extobj 需要添加的扩展
 */
export function RegistExtension(extobj) {
  Object.keys(extobj).forEach((name) => {
    if (RegistedObjs[name] === undefined) {
      RegistedObjs[name] = extobj[name];

      switch (name) {
        case HandledExtensions.PBRMaterial:
          extensionParsers.KHR_materials_unlit = PBRMaterial;
          break;
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
}

/**
 * 解析 glTF 结构
 * @param resource
 * @returns {*}
 * @private
 */
export function parseGLTF(data: LoadedGLTFResource, engine: Engine): GLTFResource {
  // 开始处理 glTF 数据
  const resources: GLTFParsed = {
    engine,
    images: data.images,
    gltf: data.gltf,
    buffers: data.buffers,
    asset: new GLTFResource()
  };

  if (resources.gltf.asset && resources.gltf.asset.version) {
    resources.gltf.version = Number(resources.gltf.asset.version);
    resources.gltf.isGltf2 = resources.gltf.version >= 2 && resources.gltf.version <= 3;
  }

  parseExtensions(resources);

  // parse all related resources
  // @ts-ignore
  return parseResources(resources, "textures", parseTexture)
    .then(() => parseResources(resources, "materials", parseMaterial))
    .then(() => parseResources(resources, "meshes", parseMesh))
    .then(() => parseResources(resources, "nodes", parseNode))
    .then(() => parseResources(resources, "scenes", parseScene))
    .then(() => parseResources(resources, "skins", parseSkin))
    .then(() => parseResources(resources, "animations", parseAnimation))
    .then(() => buildSceneGraph(resources));
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
 * 通用资源解析方法
 * @param resources 现有资源
 * @param name glTF 中资源
 * @param handler 资源解析器
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

var GLTF_TEX_COUNT = 0;

/**
 * 解析贴图
 * @param gltfTexture
 * @param resources
 * @private
 */
export function parseTexture(gltfTexture, resources: GLTFParsed) {
  const { images } = resources;

  // TODO: 暂不支持 gltf wrapS、wrapT 和 minFilter、magFilter 设置
  const image = images[gltfTexture.source];
  // const gltfImage = gltf.images[gltfTexture.source];

  GLTF_TEX_COUNT++;
  // TODO: support gltf texture compress
  // TODO: modify to engine and order
  const tex = new Texture2D(image.width, image.height, undefined, undefined, resources.engine);
  tex.setImageSource(image);
  tex.generateMipmaps();
  // @ts-ignore 默认给 texture 加上缓存
  resources.engine.resourceManager._addAsset(image.src, tex);
  return Promise.resolve(tex);
}

/**
 * 解析 材质
 * @param gltfMaterial
 * @param resources
 * @private
 */
export function parseMaterial(gltfMaterial, resources) {
  const { gltf, asset } = resources;
  let material;

  if (gltf.isGltf2 && typeof gltfMaterial.technique === "undefined") {
    const uniformObj: any = {};
    const stateObj: any = {};
    const {
      pbrMetallicRoughness,
      normalTexture,
      emissiveTexture,
      emissiveFactor,
      occlusionTexture,
      alphaMode,
      alphaCutoff,
      doubleSided,
      extensions
    } = gltfMaterial;

    if (pbrMetallicRoughness) {
      const {
        baseColorFactor,
        baseColorTexture,
        metallicFactor,
        roughnessFactor,
        metallicRoughnessTexture
      } = pbrMetallicRoughness;
      if (baseColorTexture) {
        uniformObj.baseColorTexture = getItemByIdx("textures", baseColorTexture.index || 0, resources);
      }
      if (baseColorFactor) {
        uniformObj.baseColorFactor = new Vector4(...baseColorFactor);
      }
      uniformObj.metallicFactor = metallicFactor !== undefined ? metallicFactor : 1;
      uniformObj.roughnessFactor = roughnessFactor !== undefined ? roughnessFactor : 1;
      if (metallicRoughnessTexture) {
        uniformObj.metallicRoughnessTexture = getItemByIdx("textures", metallicRoughnessTexture.index || 0, resources);
      }
    }

    if (normalTexture) {
      const { index, texCoord, scale } = normalTexture;
      uniformObj.normalTexture = getItemByIdx("textures", index || 0, resources);

      if (typeof scale !== undefined) {
        uniformObj.normalScale = scale;
      }
    }

    if (emissiveTexture) {
      uniformObj.emissiveTexture = getItemByIdx("textures", emissiveTexture.index || 0, resources);
    }

    if (occlusionTexture) {
      uniformObj.occlusionTexture = getItemByIdx("textures", occlusionTexture.index || 0, resources);

      if (occlusionTexture.strength !== undefined) {
        uniformObj.occlusionStrength = occlusionTexture.strength;
      }
    }

    stateObj.doubleSided = !!doubleSided;
    stateObj.alphaMode = alphaMode || "OPAQUE";
    if (alphaMode === "MASK") {
      uniformObj.alphaCutoff = alphaCutoff === undefined ? 0.5 : alphaCutoff;
    }

    if (extensions) {
      if (extensions.KHR_materials_unlit) {
        stateObj.unlit = true;
      }

      // 高光光泽度
      if (extensions.KHR_materials_pbrSpecularGlossiness) {
        const {
          diffuseFactor,
          diffuseTexture,
          specularFactor,
          glossinessFactor,
          specularGlossinessTexture
        } = extensions.KHR_materials_pbrSpecularGlossiness;

        stateObj.isMetallicWorkflow = false;
        if (diffuseFactor) {
          uniformObj.baseColorFactor = new Vector4(...diffuseFactor);
        }
        if (diffuseTexture) {
          uniformObj.baseColorTexture = getItemByIdx("textures", diffuseTexture.index || 0, resources);
        }
        if (specularFactor) {
          uniformObj.specularFactor = new Vector3(...specularFactor);
        }
        if (glossinessFactor !== undefined) {
          uniformObj.glossinessFactor = glossinessFactor;
        }
        if (specularGlossinessTexture) {
          uniformObj.specularGlossinessTexture = getItemByIdx(
            "textures",
            specularGlossinessTexture.index || 0,
            resources
          );
        }
      }
    }

    // private parameters
    const { unlit, srgb, gamma, blendFunc, depthMask } = gltfMaterial;
    if (unlit) stateObj.unlit = true;
    if (srgb) stateObj.srgb = true;
    if (gamma) stateObj.gamma = true;
    if (blendFunc) stateObj.blendFunc = blendFunc;
    if (depthMask !== undefined) stateObj.depthMask = depthMask;

    material = new PBRMaterial(gltfMaterial.name || PBRMaterial.MATERIAL_NAME, Object.assign({}, uniformObj, stateObj));
  } else {
    const techniqueName = gltfMaterial.technique;
    Logger.warn("Deprecated: Please use a model that meets the glTF 2.0 specification");
    const MaterialType = RegistedCustomMaterials[techniqueName];
    material = new MaterialType();
  }

  if (gltfMaterial.hasOwnProperty("values")) {
    Logger.warn("Deprecated: Please use a model that meets the glTF 2.0 specification");
    for (const paramName in gltfMaterial.values) {
      if (!material.technique) {
        Logger.warn("Cant not find technique");
        continue;
      }
      const uniform = findByKeyValue(material.technique.uniforms, "paramName", paramName);
      if (!uniform) {
        Logger.warn("Cant not find uniform: " + paramName);
        continue;
      }

      const name = uniform.name;
      const type = uniform.type;
      if (type === DataType.SAMPLER_2D) {
        let textureIndex = gltfMaterial.values[paramName];
        if (Util.isArray(textureIndex)) {
          textureIndex = textureIndex[0];
        }
        const texture = getItemByIdx("textures", textureIndex, resources);
        material.setValue(name, texture);
      } else {
        material.setValue(name, gltfMaterial.values[paramName]);
      }
    }
  }
  return Promise.resolve(material);
}

/**
 * 解析蒙皮
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

function parsePrimitiveVertex(primitive, gltfPrimitive, gltf, buffers) {
  // load vertices
  let h = 0;
  for (const attributeSemantic in gltfPrimitive.attributes) {
    const accessorIdx = gltfPrimitive.attributes[attributeSemantic];
    const accessor = gltf.accessors[accessorIdx];

    const buffer = getAccessorData(gltf, accessor, buffers);
    primitive.vertexBuffers.push(buffer);
    primitive.vertexAttributes[attributeSemantic] = createAttribute(gltf, attributeSemantic, accessor, h++);
  }

  // get vertex count
  const accessorIdx = gltfPrimitive.attributes.POSITION;
  const accessor = gltf.accessors[accessorIdx];
  primitive.vertexCount = accessor.count;

  // load indices
  const indexAccessor = gltf.accessors[gltfPrimitive.indices];
  const buffer = getAccessorData(gltf, indexAccessor, buffers);

  primitive.indexCount = indexAccessor.count;
  primitive.indexType = indexAccessor.componentType;
  primitive.indexOffset = 0;
  primitive.indexBuffer = buffer;
  return Promise.resolve(primitive);
}

function parserPrimitiveTarget(primitive, gltfPrimitive, gltf, buffers) {
  // load morph targets
  if (gltfPrimitive.hasOwnProperty("targets")) {
    let accessorIdx, accessor, buffer;
    let attributeCount = primitive.vertexBuffers.length;
    for (let j = 0; j < gltfPrimitive.targets.length; j++) {
      const target = gltfPrimitive.targets[j];
      for (const attributeSemantic in target) {
        switch (attributeSemantic) {
          case "POSITION":
            accessorIdx = target.POSITION;
            accessor = gltf.accessors[accessorIdx];

            buffer = getAccessorData(gltf, accessor, buffers);
            primitive.vertexBuffers.push(buffer);
            const posAttrib = createAttribute(gltf, `POSITION_${j}`, accessor, attributeCount++);
            primitive.vertexAttributes[`POSITION_${j}`] = posAttrib;
            target["POSITION"] = { ...posAttrib };
            break;
          case "NORMAL":
            accessorIdx = target.NORMAL;
            accessor = gltf.accessors[accessorIdx];

            buffer = getAccessorData(gltf, accessor, buffers);
            primitive.vertexBuffers.push(buffer);
            const normalAttrib = createAttribute(gltf, `NORMAL_${j}`, accessor, attributeCount++);
            primitive.vertexAttributes[`NORMAL_${j}`] = normalAttrib;
            target["NORMAL"] = { ...normalAttrib };
            break;
          case "TANGENT":
            accessorIdx = target.TANGENT;
            accessor = gltf.accessors[accessorIdx];

            buffer = getAccessorData(gltf, accessor, buffers);
            primitive.vertexBuffers.push(buffer);
            const tangentAttrib = createAttribute(gltf, `TANGENT_${j}`, accessor, attributeCount++);
            primitive.vertexAttributes[`TANGENT_${j}`] = tangentAttrib;
            target["TANGENT"] = { ...tangentAttrib };
            break;
          default:
            Logger.error(`unknown morth target semantic "${attributeSemantic}"`);
            break;
        }
        primitive.targets.push(target);
      }
    }
  }
}

function parsePrimitiveMaterial(primitive, gltfPrimitive, resources) {
  // link mesh primitive material
  if (gltfPrimitive.material !== undefined) {
    let material = getItemByIdx("materials", gltfPrimitive.material, resources);
    if (material.constructor.DISABLE_SHARE) {
      // do not share material cause different attributes
      material = material.clone();
    }
    primitive.materialIndex = gltfPrimitive.material;
    primitive.material = material;
  } else {
    primitive.material = getDefaultMaterial();
  }
}

/**
 * 解析 Mesh
 * @param gltfMesh
 * @param resources
 * @private
 */
export function parseMesh(gltfMesh, resources) {
  const { gltf, buffers } = resources;

  const mesh = new Mesh(gltfMesh.name);
  mesh.type = resources.assetType;
  // parse all primitives then link to mesh
  // TODO: use hash cached primitives
  const primitivePromises = [];
  for (let i = 0; i < gltfMesh.primitives.length; i++) {
    primitivePromises.push(
      new Promise((resolve, reject) => {
        const gltfPrimitive = gltfMesh.primitives[i];
        // FIXME: use index as primitive's name
        const primitive = new Primitive(gltfPrimitive.name || gltfMesh.name || i);
        primitive.type = resources.assetType;
        primitive.mode = gltfPrimitive.mode == null ? DrawMode.TRIANGLES : gltfPrimitive.mode;
        if (gltfPrimitive.hasOwnProperty("targets")) {
          primitive.targets = [];
          (mesh as any).weights = gltfMesh.weights || new Array(gltfPrimitive.targets.length).fill(0);
        }
        let vertexPromise;
        if (gltfPrimitive.extensions && gltfPrimitive.extensions[HandledExtensions.KHR_draco_mesh_compression]) {
          const extensionParser = extensionParsers.KHR_draco_mesh_compression;
          const extension = gltfPrimitive.extensions[HandledExtensions.KHR_draco_mesh_compression];
          vertexPromise = extensionParser.parse(extension, primitive, gltfPrimitive, gltf, buffers);
        } else {
          vertexPromise = parsePrimitiveVertex(primitive, gltfPrimitive, gltf, buffers);
        }
        vertexPromise
          .then(() => {
            parserPrimitiveTarget(primitive, gltfPrimitive, gltf, buffers);
            parsePrimitiveMaterial(primitive, gltfPrimitive, resources);
            resolve(primitive);
          })
          .catch((e) => {
            reject(e);
          });
      })
    );
  }
  return Promise.all(primitivePromises).then((primitives) => {
    for (let i = 0; i < primitives.length; i++) {
      mesh.primitives.push(primitives[i]);
    }
    return mesh;
  });
}

/**
 * 解析动画
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
    animationClip.addSampler(input, output, outputAccessorSize, samplerInterpolation);
  }

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
 * 解析 glTF 节点
 * @param gltfNode
 * @param resources
 * @private
 */
export function parseNode(gltfNode, resources) {
  // TODO: undefined name?
  const entity = new Entity(gltfNode.name || `GLTF_NODE_${nodeCount++}`);

  if (gltfNode.hasOwnProperty("matrix")) {
    const m = gltfNode.matrix;
    const mat = new Matrix(
      m[0],
      m[1],
      m[2],
      m[3],
      m[4],
      m[5],
      m[6],
      m[7],
      m[8],
      m[9],
      m[10],
      m[11],
      m[12],
      m[13],
      m[14],
      m[15]
    );
    const pos = new Vector3();
    const scale = new Vector3(1, 1, 1);
    const rot = new Quaternion();
    mat.decompose(pos, rot, scale);

    entity.position = pos;
    entity.rotation = rot;
    entity.scale = scale;
  } else {
    for (const key in TARGET_PATH_MAP) {
      if (gltfNode.hasOwnProperty(key)) {
        const mapKey = TARGET_PATH_MAP[key];
        if (mapKey === "weights") {
          entity[mapKey] = gltfNode[key];
        } else {
          const arr = gltfNode[key];
          const len = arr.length;
          if (len === 2) {
            entity[mapKey] = new Vector2(...arr);
          } else if (len === 3) {
            entity[mapKey] = new Vector3(...arr);
          } else if (len === 4) {
            entity[mapKey] = new Vector4(...arr);
          }
        }
      }
    }
  }

  if (gltfNode.extensions) {
    if (KHR_lights && gltfNode.extensions.KHR_lights) {
      const lightIdx = gltfNode.extensions.KHR_lights.light;
      if (lightIdx !== undefined) {
        const light = getItemByIdx("lights", lightIdx, resources);
        if (light) entity.addComponent(light.ability, light.props);
      }
    }
  }

  return Promise.resolve(entity);
}

/**
 * 解析 glTF 场景
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
 * 通过索引获得内容
 * @param name
 * @param idx
 * @param resources
 * @returns {*}
 * @private
 */
export function getItemByIdx(name, idx, resources) {
  const { asset } = resources;

  const itemIdx = asset[name].length - idx - 1;
  return asset[name][itemIdx];
}

/**
 * 构造 scene graph，根据节点配置创建 Ability
 * @param resources
 * @private
 */
export function buildSceneGraph(resources: GLTFParsed): GLTFResource {
  const { asset, gltf } = resources;

  const gltfNodes = gltf.nodes || [];

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
      // find mesh
      const mesh = getItemByIdx("meshes", gltfNode.mesh, resources);

      if (gltfNode.hasOwnProperty("skin") || mesh.hasOwnProperty("weights")) {
        const skin = getItemByIdx("skins", gltfNode.skin, resources);
        const weights = mesh.weights;
        node.addComponent(SkinnedMeshRenderer, { skin, mesh, weights });
      } else {
        node.addComponent(MeshRenderer, { mesh });
      }
    }

    //@ts-ignore
    const nodes = asset.defaultScene.nodes;
    if (nodes.length === 1) {
      asset.defaultSceneRoot = nodes[0];
    } else {
      const rootNode = new Entity(null, resources.engine);
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
  }
  return resources.asset as GLTFResource;
}
