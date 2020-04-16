import {
  Logger,
  Util,
  DrawMode,
  DataType,
  TextureFilter,
  TextureWrapMode,
  MaterialType,
  RenderState
} from "@alipay/o3-base";
import { openTechnique, path } from "@alipay/o3-loader";
import { Node } from "@alipay/o3-core";
import { Texture2D, Material } from "@alipay/o3-material";
import { ConstantMaterial } from "@alipay/o3-mobile-material";
import { Primitive } from "@alipay/o3-primitive";
import { Mesh, Skin, AMeshRenderer, ASkinnedMeshRenderer } from "@alipay/o3-mesh";
import { vec3, mat4, quat } from "@alipay/o3-math";
import {
  attachLoadingQueue,
  getAccessorData,
  getAccessorTypeSize,
  createAttribute,
  findByKeyValue,
  attachAsset,
  getBufferData,
  getComponentType
} from "./Util";
import { AnimationClip, InterpolationType } from "@alipay/o3-animation";

import { glTFDracoMeshCompression } from "./glTFDracoMeshCompression";

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

const getDefaultMaterial = (function() {
  let defaultMateril: ConstantMaterial;
  return () => {
    if (!defaultMateril) {
      defaultMateril = new ConstantMaterial("default");
      defaultMateril.emission = [0.749, 0.749, 0.749, 1];
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

let PBRMaterial = null;
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
  Object.keys(extobj).forEach(name => {
    if (RegistedObjs[name] === undefined) {
      RegistedObjs[name] = extobj[name];

      switch (name) {
        case HandledExtensions.PBRMaterial:
          PBRMaterial = extobj[name];
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

/**
 * 解析 glTF 结构
 * @param resource
 * @returns {*}
 * @private
 */
export function parseGLTF(resource) {
  // 开始处理 glTF 数据
  // buffers
  const data = resource.data;

  const resources = {
    asset: resource.asset,
    assetType: resource.assetType,
    images: data.images,
    gltf: data.gltf,
    buffers: data.buffers,
    shaders: data.shaders
  };

  if (resources.gltf.asset && resources.gltf.asset.version) {
    resources.gltf.version = Number(resources.gltf.asset.version);
    resources.gltf.isGltf2 = resources.gltf.version >= 2 && resources.gltf.version <= 3;
  }

  parseExtensions(resources);

  // parse all related resources
  return parseResources(resources, "textures", parseTexture)
    .then(() => parseResources(resources, "techniques", parseTechnique))
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
function parseResources(resources, name, handler) {
  const { gltf, asset } = resources;

  if (gltf.hasOwnProperty(name)) {
    const entities = gltf[name] || [];
    Logger.debug(name + ":", entities);
    const promises = [];
    for (let i = entities.length - 1; i >= 0; i--) {
      promises.push(handler(entities[i], resources));
    }
    return Promise.all(promises).then(results => {
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
export function parseTexture(gltfTexture, resources) {
  const { gltf, images } = resources;

  // get sampler & image
  let sampler;
  if (gltfTexture.sampler === undefined) {
    sampler = {
      magFilter: TextureFilter.NEAREST,
      minFilter: TextureFilter.NEAREST,
      wrapS: TextureWrapMode.REPEAT,
      wrapT: TextureWrapMode.REPEAT
    };
  } else {
    sampler = Object.assign(
      {
        magFilter: TextureFilter.LINEAR,
        minFilter: TextureFilter.LINEAR_MIPMAP_LINEAR,
        wrapS: TextureWrapMode.REPEAT,
        wrapT: TextureWrapMode.REPEAT
      },
      gltf.samplers[gltfTexture.sampler]
    );
  }
  const image = images[gltfTexture.source];
  const gltfImage = gltf.images[gltfTexture.source];

  GLTF_TEX_COUNT++;
  const name = gltfTexture.name || gltfImage.name || gltfImage.uri || "GLTF_TEX_" + GLTF_TEX_COUNT;
  const tex = new Texture2D(name, image, sampler);
  tex.type = resources.assetType;
  return Promise.resolve(tex);
}

/**
 * 解析 technique
 * @param gltfTechnique
 * @param resources
 * @private
 */
export function parseTechnique(gltfTechnique, resources) {
  const { gltf, shaders } = resources;

  const program = gltf.programs[gltfTechnique.program];

  const vertCode = shaders[program.vertexShader];
  const fragCode = shaders[program.fragmentShader];

  const tech = openTechnique(gltfTechnique, vertCode, fragCode);
  tech.type = resources.assetType;

  return Promise.resolve(tech);
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

  if (gltf.isGltf2 && typeof gltfMaterial.technique === "undefined" && PBRMaterial) {
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
        uniformObj.baseColorFactor = baseColorFactor;
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
          uniformObj.baseColorFactor = diffuseFactor;
        }
        if (diffuseTexture) {
          uniformObj.baseColorTexture = getItemByIdx("textures", diffuseTexture.index || 0, resources);
        }
        if (specularFactor) {
          uniformObj.specularFactor = specularFactor;
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
    const { unlit, srgb, gamma, clearCoat, clearCoatRoughness, blendFunc, depthMask } = gltfMaterial;
    if (unlit) stateObj.unlit = true;
    if (srgb) stateObj.srgb = true;
    if (gamma) stateObj.gamma = true;
    if (clearCoat) uniformObj.clearCoat = clearCoat;
    if (clearCoatRoughness !== undefined) uniformObj.clearCoatRoughness = clearCoatRoughness;
    if (blendFunc) stateObj.blendFunc = blendFunc;
    if (depthMask !== undefined) stateObj.depthMask = depthMask;

    material = new PBRMaterial(gltfMaterial.name || PBRMaterial.MATERIAL_NAME, Object.assign({}, uniformObj, stateObj));
  } else {
    // use local technique
    const techniqueName = gltfMaterial.technique;
    material = new Material(gltfMaterial.name);

    if (Number.isInteger(techniqueName)) {
      material.technique = getItemByIdx("techniques", techniqueName, resources);

      const technique = material.technique;
      if (
        technique &&
        technique.states &&
        technique.states.enable &&
        technique.states.enable.indexOf(RenderState.BLEND) > -1
      ) {
        material.renderType = MaterialType.TRANSPARENT;
      }
    } else if (typeof techniqueName === "string" && RegistedCustomMaterials[techniqueName]) {
      const MaterialType = RegistedCustomMaterials[techniqueName];
      material = new MaterialType();
    } else {
      // TODO: add default fallback material -> static_diffuse
      // find & link technique
      for (let j = 0; j < asset.techniques.length; j++) {
        if (asset.techniques[j].name === techniqueName) {
          material.technique = asset.techniques[j];
          break;
        }
      }

      const technique = material.technique;
      if (
        technique &&
        technique.states &&
        technique.states.enable &&
        technique.states.enable.indexOf(RenderState.BLEND) > -1
      ) {
        material.renderType = MaterialType.TRANSPARENT;
      }
    }
  }

  if (gltfMaterial.hasOwnProperty("values")) {
    for (const paramName in gltfMaterial.values) {
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
    skin.inverseBindMatrices[i] = buffer.subarray(startIdx, endIdx);
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
      new Promise(resolve => {
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
        vertexPromise.then(() => {
          parserPrimitiveTarget(primitive, gltfPrimitive, gltf, buffers);
          parsePrimitiveMaterial(primitive, gltfPrimitive, resources);
          resolve(primitive);
        });
      })
    );
  }
  return Promise.all(primitivePromises).then(primitives => {
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
  const node = new Node(null, null, gltfNode.name || `GLTF_NODE_${nodeCount++}`);

  if (gltfNode.hasOwnProperty("matrix")) {
    const m = gltfNode.matrix;
    const mat = mat4.fromValues(
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
    const pos = vec3.create();
    const scale = vec3.fromValues(1, 1, 1);
    const rot = quat.create();
    mat4.decompose(mat, pos, rot, scale);

    node.position = pos;
    node.rotation = rot;
    node.scale = scale;
  } else {
    for (const key in TARGET_PATH_MAP) {
      if (gltfNode.hasOwnProperty(key)) {
        node[TARGET_PATH_MAP[key]] = gltfNode[key];
      }
    }
  }

  if (gltfNode.extensions) {
    if (KHR_lights && gltfNode.extensions.KHR_lights) {
      const lightIdx = gltfNode.extensions.KHR_lights.light;
      if (lightIdx !== undefined) {
        const light = getItemByIdx("lights", lightIdx, resources);
        if (light) node.createAbility(light.ability, light.props);
      }
    }
  }

  return Promise.resolve(node);
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
        if (light) sceneNodes[0].createAbility(light.ability, light.props);
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
export function buildSceneGraph(resources) {
  const { asset, gltf } = resources;

  const gltfNodes = gltf.nodes || [];

  asset.rootScene = getItemByIdx("scenes", gltf.scene, resources);

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
        node.createAbility(ASkinnedMeshRenderer, { skin, mesh, weights });
      } else {
        node.createAbility(AMeshRenderer, { mesh });
      }
    }
  }
  return resources;
}

const BASE64_MARKER = ";base64,";

class GLTFHandler {
  /**
   * 加载 glTF 及其内置的资源文件
   * @param request
   * @param props
   * @param callback
   */
  load(request, props, callback) {
    const data = {
      images: [],
      gltf: {},
      buffers: [],
      shaders: []
    };
    const filesMap = props.filesMap || {};
    // async load images
    // load gltf & all related resources
    request.load(
      "json",
      props,
      function(err, gltfJSON) {
        if (!err) {
          data.gltf = gltfJSON;
          // load images & buffers & shader texts
          const loadQueue = {};
          const loadImageQue = {};

          const dir = path.getDirectory(props.url);
          attachLoadingQueue(dir, loadQueue, gltfJSON.buffers, "binary", filesMap);
          attachLoadingQueue(dir, loadQueue, gltfJSON.images, "image", filesMap);
          attachLoadingQueue(dir, loadQueue, gltfJSON.shaders, "text", filesMap);

          request.loadAll(loadQueue, function(err, resMap) {
            if (gltfJSON.hasOwnProperty("buffers")) {
              for (let i = 0; i < gltfJSON.buffers.length; i++) {
                const buffer = gltfJSON.buffers[i];
                if (buffer.uri.substr(0, 5) !== "data:") data.buffers[i] = resMap[buffer.uri];
                else {
                  const base64Idx = buffer.uri.indexOf(BASE64_MARKER) + BASE64_MARKER.length;
                  const blob = window.atob(buffer.uri.substr(base64Idx));
                  const bytes = new Uint8Array(blob.length);
                  for (let i = 0; i < blob.length; i++) bytes[i] = blob.charCodeAt(i);
                  data.buffers[i] = bytes.buffer;
                }
              }
            }

            if (gltfJSON.hasOwnProperty("images")) {
              for (let i = 0; i < gltfJSON.images.length; i++) {
                const image = gltfJSON.images[i];
                if (image.uri)
                  if (image.uri.substr(0, 5) !== "data:") data.images[i] = resMap[image.uri];
                  else {
                    const img = new Image();
                    img.src = image.uri;
                    data.images[i] = img;
                  }
                else {
                  const arrayBuffer = getBufferData(gltfJSON.bufferViews[image.bufferView], data.buffers);
                  const type = image.mimeType || "image/jpeg";
                  loadImageQue[i] = {
                    type: "imageBuffer",
                    props: {
                      imageBuffer: arrayBuffer,
                      type
                    }
                  };
                }
              }
            }

            if (gltfJSON.hasOwnProperty("shaders")) {
              for (let i = 0; i < gltfJSON.shaders.length; i++) {
                const shader = gltfJSON.shaders[i];

                // adapted to the shader form of net file and inside base64 code
                const base64Index = shader.uri.indexOf(BASE64_MARKER) + BASE64_MARKER.length;

                data.shaders[i] = resMap[shader.uri] || window.atob(shader.uri.substr(base64Index));
              }
            }

            request.loadAll(loadImageQue, function(err, imgMap) {
              if (gltfJSON.hasOwnProperty("images")) {
                for (let i = 0; i < gltfJSON.images.length; i++) {
                  const image = gltfJSON.images[i];
                  if (image.hasOwnProperty("bufferView")) {
                    data.images[i] = imgMap[i];
                  }
                }
              }

              callback(null, data);
            });
          });
        } else {
          callback("Error loading glTF JSON from " + props.url);
        }
      },
      true
    );
  }

  /**
   * 在 loader 所有资源加载完成后做处理
   * @param resource 当前资源
   * @param resources loader 加载的所有资源
   * @private
   */
  // load & use engine exist resources
  patch(resource, resources) {
    // use preload techniques
    attachAsset(resource, resources);
  }

  /**
   * 实例化该资源
   * @param resource
   * @private
   */
  open(resource) {
    return parseGLTF(resource);
  }
}

export { GLTFHandler };
