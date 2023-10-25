import {
  AssetType,
  BlinnPhongMaterial,
  Entity,
  ModelMesh,
  PBRMaterial,
  PBRSpecularMaterial,
  PointLight,
  RenderFace,
  SkinnedMeshRenderer,
  SpotLight,
  TextureCoordinate,
  TextureFilterMode,
  TextureWrapMode,
  UnlitMaterial
} from "@galacean/engine-core";
import {
  GLTFExtensionMode,
  GLTFExtensionParser,
  GLTFExtensionSchema,
  GLTFParser,
  GLTFParserContext,
  GLTFParserType,
  GLTFResource,
  GLTFSchemaParser,
  registerGLTFExtension,
  registerGLTFParser
} from "@galacean/engine-loader";
import { Color } from "@galacean/engine-math";
import { WebGLEngine } from "@galacean/engine-rhi-webgl";
import { expect } from "chai";

let engine: WebGLEngine;
before(async function () {
  const canvasDOM = document.createElement("canvas");
  canvasDOM.width = 1024;
  canvasDOM.height = 1024;
  engine = await WebGLEngine.create({ canvas: canvasDOM });

  @registerGLTFParser(GLTFParserType.Schema)
  class GLTFCustomJSONParser extends GLTFParser {
    parse(context: GLTFParserContext) {
      const glTF = <any>{
        buffers: [
          {
            byteLength: 1000
          }
        ],
        bufferViews: [
          {
            buffer: 0,
            byteLength: 1000
          }
        ],
        accessors: [
          {
            bufferView: 0,
            byteOffset: 0,
            componentType: 5126,
            count: 3,
            max: [2.0],
            min: [0.0],
            type: "SCALAR",
            normalized: true
          },
          {
            bufferView: 0,
            componentType: 5126,
            count: 3,
            type: "VEC3"
          }
        ],
        images: [
          {
            bufferView: 0,
            mimeType: "image/jpeg"
          }
        ],
        textures: [
          {
            sampler: 0,
            source: 0,
            name: "test"
          }
        ],
        samplers: [
          {
            magFilter: 9729,
            minFilter: 9986,
            wrapS: 10497,
            wrapT: 33648
          }
        ],
        asset: {
          version: "2.0"
        },
        extensionsUsed: [
          "KHR_materials_unlit",
          "KHR_materials_pbrSpecularGlossiness",
          "KHR_materials_clearcoat",
          "KHR_lights_punctual",
          "Custom_Material",
          "Custom_Light"
        ],
        extensionsRequired: [
          "KHR_materials_unlit",
          "KHR_materials_pbrSpecularGlossiness",
          "Custom_Material",
          "Custom_Light"
        ],
        extensions: {
          KHR_lights_punctual: {
            lights: [
              {
                color: [1, 0, 0],
                intensity: 0.5,
                type: "spot",
                range: 20,
                spot: {
                  innerConeAngle: Math.PI / 3,
                  outerConeAngle: Math.PI / 2
                }
              }
            ]
          },
          EXT_lights_image_based: {
            lights: [
              {
                intensity: 1.0,
                rotation: [0, 0, 0, 1],
                irradianceCoefficients: [],
                specularImageSize: 256,
                specularImages: []
              }
            ]
          }
        },
        nodes: [
          {
            name: "entity1",
            translation: [1, 0, 0],
            rotation: [Math.PI, 0, 0, 0],
            children: [1],
            scale: [2, 2, 2],
            extensions: {
              KHR_lights_punctual: {
                light: 0
              }
            }
          },
          {
            name: "entity2",
            translation: [1, 0, 0],
            rotation: [Math.PI, 0, 0, 0],
            scale: [2, 2, 2],
            mesh: 0,
            extensions: {
              Custom_Light: {}
            }
          }
        ],
        scene: 0,
        scenes: [
          {
            name: "scene",
            nodes: [0],
            extensions: {
              EXT_lights_image_based: {
                light: 0
              }
            }
          }
        ],
        materials: [
          {
            name: "pbr",
            pbrMetallicRoughness: {
              baseColorFactor: [1, 0, 0, 1],
              baseColorTexture: {
                index: 0,
                extensions: {
                  KHR_texture_transform: {
                    offset: [0.5, 0.5],
                    scale: [2, 2],
                    rotation: Math.PI / 2,
                    texCoord: 1
                  }
                }
              },
              metallicRoughnessTexture: {
                index: 0
              }
            },
            emissiveTexture: {
              index: 0
            },
            normalTexture: {
              index: 0,
              scale: 2
            },
            occlusionTexture: {
              index: 0,
              strength: 2,
              texCoord: 1
            },
            emissiveFactor: [1, 1, 1, 1],
            doubleSided: true,
            alphaMode: "BLEND",
            extensions: {
              KHR_materials_clearcoat: {
                clearcoatFactor: 0.5,
                clearcoatRoughnessFactor: 0.5,
                clearcoatTexture: {
                  index: 0
                },
                clearcoatRoughnessTexture: {
                  index: 0
                },
                clearcoatNormalTexture: {
                  index: 0
                }
              }
            }
          },
          {
            name: "unlit",
            alphaMode: "OPAQUE",
            pbrMetallicRoughness: {
              baseColorFactor: [0, 1, 0, 1]
            },
            extensions: {
              KHR_materials_unlit: {}
            }
          },
          {
            name: "specular",
            alphaMode: "MASK",
            alphaCutoff: 0.8,
            extensions: {
              KHR_materials_pbrSpecularGlossiness: {
                diffuseFactor: [0, 0, 1, 1],
                specularFactor: [1, 0, 0, 1],
                glossinessFactor: 0.5,
                diffuseTexture: {
                  index: 0
                },
                specularGlossinessTexture: {
                  index: 0
                }
              }
            }
          },
          {
            name: "custom blinn-phong",
            extensions: {
              Custom_Material: { baseColorFactor: [1, 1, 0, 1] }
            }
          }
        ],
        animations: [
          {
            channels: [
              {
                sampler: 0,
                target: {
                  node: 0,
                  path: "rotation"
                }
              }
            ],
            name: "animation",
            samplers: [
              {
                input: 0,
                interpolation: "LINEAR",
                output: 1
              }
            ]
          }
        ],
        meshes: [
          {
            name: "mesh",
            primitives: [
              {
                attributes: {
                  NORMAL: 1,
                  POSITION: 1,
                  TANGENT: 1,
                  TEXCOORD_0: 1
                },
                indices: 1,
                material: 0,
                mode: 4,
                targets: [
                  {
                    POSITION: 1,
                    TANGENT: 1,
                    NORMAL: 1
                  },
                  {
                    POSITION: 1,
                    TANGENT: 1,
                    NORMAL: 1
                  }
                ],
                extensions: {}
              }
            ],
            weights: [1, 1],
            extras: {
              targetNames: ["bs0", "bs1"]
            }
          }
        ]
      };

      const buffer = new ArrayBuffer(1000);
      const dataView = new Uint8Array(buffer);
      dataView.set([
        255, 216, 255, 219, 0, 67, 0, 3, 2, 2, 3, 2, 2, 3, 3, 3, 3, 4, 3, 3, 4, 5, 8, 5, 5, 4, 4, 5, 10, 7, 7, 6, 8, 12,
        10, 12, 12, 11, 10, 11, 11, 13, 14, 18, 16, 13, 14, 17, 14, 11, 11, 16, 22, 16, 17, 19, 20, 21, 21, 21, 12, 15,
        23, 24, 22, 20, 24, 18, 20, 21, 20, 255, 219, 0, 67, 1, 3, 4, 4, 5, 4, 5, 9, 5, 5, 9, 20, 13, 11, 13, 20, 20,
        20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20,
        20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 255, 192, 0, 17, 8, 0, 1, 0, 1,
        3, 1, 34, 0, 2, 17, 1, 3, 17, 1, 255, 196, 0, 21, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 8, 255,
        196, 0, 20, 16, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 255, 196, 0, 21, 1, 1, 1, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0, 0, 7, 9, 255, 196, 0, 20, 17, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 255, 218,
        0, 12, 3, 1, 0, 2, 17, 3, 17, 0, 63, 0, 157, 0, 6, 42, 155, 255, 217
      ]);
      context.buffers = [buffer];

      return Promise.resolve(glTF);
    }
  }

  @registerGLTFExtension("EXT_lights_image_based", GLTFExtensionMode.AdditiveParse)
  class EXT_lights_image_based extends GLTFExtensionParser {
    override additiveParse(
      context: GLTFParserContext,
      entity: Entity,
      extensionSchema: {
        light: number;
      }
    ): void {
      const lightsSchema = context.glTF.extensions.EXT_lights_image_based.lights;
      const lightSchema = lightsSchema[extensionSchema.light];
      // ...
    }
  }

  @registerGLTFExtension("Custom_Material", GLTFExtensionMode.CreateAndParse)
  class CustomMaterial extends GLTFExtensionParser {
    createAndParse(
      context: GLTFParserContext,
      extensionSchema: { baseColorFactor: Array<number> }
    ): BlinnPhongMaterial {
      const material = new BlinnPhongMaterial(engine);
      const baseColorFactor = extensionSchema.baseColorFactor;
      material.baseColor.set(baseColorFactor[0], baseColorFactor[1], baseColorFactor[2], baseColorFactor[3]);
      return material;
    }
  }

  @registerGLTFExtension("Custom_Light", GLTFExtensionMode.AdditiveParse)
  class CustomLight extends GLTFExtensionParser {
    additiveParse(context: GLTFParserContext, parseResource: Entity, extensionSchema: GLTFExtensionSchema): void {
      parseResource.addComponent(PointLight);
    }
  }
});

after(() => {
  @registerGLTFParser(GLTFParserType.Schema)
  class test extends GLTFSchemaParser {}
});

describe("glTF Loader test", function () {
  it("Pipeline Parser", async () => {
    const glTFResource: GLTFResource = await engine.resourceManager.load({
      type: AssetType.GLTF,
      url: "mock/path/testA.gltf"
    });
    const { materials, entities, defaultSceneRoot, textures, meshes } = glTFResource;
    const pbrMaterials = materials as PBRSpecularMaterial[] & PBRMaterial[];

    // material
    expect(pbrMaterials.length).to.equal(4);
    expect(pbrMaterials[0]).to.instanceOf(PBRMaterial);
    expect(pbrMaterials[1]).to.instanceOf(UnlitMaterial);
    expect(pbrMaterials[2]).to.instanceOf(PBRSpecularMaterial);
    expect(pbrMaterials[3]).to.instanceOf(BlinnPhongMaterial);

    expect(pbrMaterials[0].baseColor).to.deep.equal(new Color(1, 0, 0, 1));
    expect(pbrMaterials[0].emissiveColor).to.deep.equal(new Color(1, 1, 1, 1));
    expect(pbrMaterials[0].renderFace).to.equal(RenderFace.Double);
    expect(pbrMaterials[0].isTransparent).to.be.true;
    expect(pbrMaterials[0].clearCoat).to.equal(0.5);
    expect(pbrMaterials[0].clearCoatRoughness).to.equal(0.5);
    expect(pbrMaterials[1].baseColor).to.deep.equal(new Color(0, 1, 0, 1));
    expect(pbrMaterials[1].renderFace).to.equal(RenderFace.Front);
    expect(pbrMaterials[1].isTransparent).to.be.false;
    expect(pbrMaterials[2].baseColor).to.deep.equal(new Color(0, 0, 1, 1));
    expect(pbrMaterials[2].specularColor).to.deep.equal(new Color(1, 0, 0, 1));
    expect(pbrMaterials[2].alphaCutoff).to.equal(0.8);
    expect(pbrMaterials[2].glossiness).to.equal(0.5);
    expect(pbrMaterials[3].baseColor).to.deep.equal(new Color(1, 1, 0, 1));

    // entity
    expect(entities.length).to.equal(2);
    expect(entities[0].transform.position).to.deep.include({ x: 1, y: 0, z: 0 });
    expect(entities[0].transform.rotationQuaternion).to.deep.include({ x: Math.PI, y: 0, z: 0, w: 0 });
    expect(entities[0].transform.scale).to.deep.include({ x: 2, y: 2, z: 2 });
    const directLight = entities[0].getComponent(SpotLight);
    expect(directLight).to.exist;
    expect(directLight.distance).to.equal(20);
    expect(directLight.intensity).to.equal(0.5);
    expect(directLight.color).to.deep.equal(new Color(1, 0, 0, 1));
    expect(directLight.angle).to.equal(Math.PI / 3);
    expect(directLight.penumbra).to.closeTo(Math.PI / 6, 1e-6);

    expect(entities[1].getComponent(PointLight)).to.exist;
    expect(defaultSceneRoot).to.instanceOf(Entity);

    // texture
    expect(textures.length).to.equal(1);
    expect(textures[0].name).to.equal("test");
    expect(textures[0].filterMode).to.equal(TextureFilterMode.Trilinear);
    expect(textures[0].wrapModeU).to.equal(TextureWrapMode.Repeat);
    expect(textures[0].wrapModeV).to.equal(TextureWrapMode.Mirror);
    expect(pbrMaterials[0].tilingOffset.z).to.equal(0.5);
    expect(pbrMaterials[0].tilingOffset.w).to.equal(0.5);
    expect(pbrMaterials[0].tilingOffset.x).to.equal(2);
    expect(pbrMaterials[0].tilingOffset.y).to.equal(2);
    expect(pbrMaterials[0].baseTexture).to.exist;
    expect(pbrMaterials[0].roughnessMetallicTexture).to.exist;
    expect(pbrMaterials[0].emissiveTexture).to.exist;
    expect(pbrMaterials[0].normalTexture).to.exist;
    expect(pbrMaterials[0].normalTextureIntensity).to.equal(2);
    expect(pbrMaterials[0].occlusionTexture).to.exist;
    expect(pbrMaterials[0].occlusionTextureIntensity).to.equal(2);
    expect(pbrMaterials[0].occlusionTextureCoord).to.equal(TextureCoordinate.UV1);
    expect(pbrMaterials[0].clearCoatTexture).to.exist;
    expect(pbrMaterials[0].clearCoatRoughnessTexture).to.exist;
    expect(pbrMaterials[0].clearCoatNormalTexture).to.exist;
    expect(pbrMaterials[2].baseTexture).to.exist;
    expect(pbrMaterials[2].specularGlossinessTexture).to.exist;

    // mesh
    expect(meshes.length).to.equal(1);
    expect(meshes[0].length).to.equal(1);
    expect(meshes[0][0]).to.instanceOf(ModelMesh);
    expect(meshes[0][0].blendShapeCount).to.equal(2);
    expect(meshes[0][0].getBlendShapeName(0)).to.equal("bs0");
    expect(meshes[0][0].getBlendShapeName(1)).to.equal("bs1");
    const renderer = entities[1].getComponent(SkinnedMeshRenderer);
    expect(renderer).to.exist;
    expect(renderer.blendShapeWeights).to.deep.include([1, 1]);
  });
});

describe("glTF instance test", function () {
  it("GLTFResource GC", async () => {
    const glTFResource: GLTFResource = await engine.resourceManager.load({
      type: AssetType.GLTF,
      url: "mock/path/testB.gltf"
    });
    const { materials, textures, meshes } = glTFResource;

    let glTFResourceCache = engine.resourceManager.getFromCache("mock/path/testB.gltf");
    expect(glTFResourceCache).to.not.be.null;

    // Test GC with instance
    const instance = glTFResource.instantiateSceneRoot();
    engine.resourceManager.gc();
    glTFResourceCache = engine.resourceManager.getFromCache("mock/path/testB.gltf");
    expect(glTFResourceCache).to.be.not.null;
    expect(materials[0].destroyed).to.be.false;

    // Test GC with part instance exist
    instance.children[0].destroy();
    engine.resourceManager.gc();
    glTFResourceCache = engine.resourceManager.getFromCache("mock/path/testB.gltf");
    expect(glTFResourceCache).to.be.not.null;
    expect(materials[0].destroyed).to.be.false;

    // Test GC with no instance exist
    instance.destroy();
    engine.resourceManager.gc();
    glTFResourceCache = engine.resourceManager.getFromCache("mock/path/testB.gltf");
    expect(glTFResourceCache).to.be.null;
    expect(materials[0].destroyed).to.be.true;
  });
});

describe("glTF instance test", function () {
  it("GLTFResource destroy directly", async () => {
    const glTFResource: GLTFResource = await engine.resourceManager.load({
      type: AssetType.GLTF,
      url: "mock/path/testC.gltf"
    });
    const { materials, textures, meshes } = glTFResource;

    let glTFResourceCache = engine.resourceManager.getFromCache("mock/path/testC.gltf");
    expect(glTFResourceCache).to.not.be.null;

    // Test destroy sub resource directly with not destroy glTFResource
    materials[0].destroy();
    expect(materials[0].destroyed).to.be.false;

    // Test destroy glTFResource directly
    glTFResource.destroy();
    expect(glTFResource.destroyed).to.be.true;

    // Test destroy glTFResource directly with glTFResource already destroyed
    expect(materials[0].destroyed).to.be.false;
    materials[0].destroy();
    expect(materials[0].destroyed).to.be.true;
  });
});
