import {
  AnimationClip,
  AnimationFloatArrayCurve,
  Animator,
  AnimatorControllerLayer,
  AnimatorLayerBlendingMode,
  AnimatorStateMachine,
  AssetPromise,
  AssetType,
  BlinnPhongMaterial,
  Entity,
  InterpolationType,
  Keyframe,
  ModelMesh,
  PBRMaterial,
  PointLight,
  RenderFace,
  SkinnedMeshRenderer,
  SpotLight,
  Texture2D,
  TextureCoordinate,
  TextureFilterMode,
  TextureWrapMode,
  UnlitMaterial,
  WrapMode
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
import { Color, Quaternion, Vector3 } from "@galacean/engine-math";
import { WebGLEngine } from "@galacean/engine";
import { describe, beforeAll, afterAll, expect, it, vi } from "vitest";

let engine: WebGLEngine;
beforeAll(async function () {
  const canvasDOM = document.createElement("canvas");
  canvasDOM.width = 1024;
  canvasDOM.height = 1024;
  engine = await WebGLEngine.create({ canvas: canvasDOM });

  @registerGLTFParser(GLTFParserType.Schema)
  class GLTFCustomJSONParser extends GLTFParser {
    parse(context: GLTFParserContext) {
      if (context.glTFResource.url === "Assets/Models/Hero.gltf" || context.glTFResource.url.startsWith("blob:")) {
        return new GLTFSchemaParser().parse(context);
      }

      if (context.glTFResource.url.endsWith("testSkinRoot.gltf")) {
        context.buffers = [new ArrayBuffer(128)];
        return Promise.resolve({
          asset: {
            version: "2.0"
          },
          scene: 0,
          scenes: [
            {
              nodes: [0, 1]
            }
          ],
          nodes: [
            {
              name: "Character_Man"
            },
            {
              name: "mixamorig:Hips",
              children: [2]
            },
            {
              name: "mixamorig:Spine"
            }
          ],
          skins: [
            {
              inverseBindMatrices: 0,
              joints: [1, 2]
            }
          ],
          accessors: [
            {
              bufferView: 0,
              byteOffset: 0,
              componentType: 5126,
              count: 2,
              type: "MAT4"
            }
          ],
          bufferViews: [
            {
              buffer: 0,
              byteOffset: 0,
              byteLength: 128
            }
          ],
          buffers: [
            {
              byteLength: 128
            }
          ]
        });
      }

      if (context.glTFResource.url.endsWith("testSingleSkeleton.gltf")) {
        context.buffers = [new ArrayBuffer(128)];
        return Promise.resolve({
          asset: {
            version: "2.0"
          },
          scene: 0,
          scenes: [
            {
              nodes: [0, 2]
            }
          ],
          nodes: [
            {
              name: "Character_Root",
              children: [1]
            },
            {
              name: "mixamorig:Hips"
            },
            {
              name: "Light"
            }
          ],
          skins: [
            {
              inverseBindMatrices: 0,
              joints: [0, 1]
            }
          ],
          accessors: [
            {
              bufferView: 0,
              byteOffset: 0,
              componentType: 5126,
              count: 2,
              type: "MAT4"
            }
          ],
          bufferViews: [
            {
              buffer: 0,
              byteOffset: 0,
              byteLength: 128
            }
          ],
          buffers: [
            {
              byteLength: 128
            }
          ]
        });
      }

      if (context.glTFResource.url.endsWith("testSkinRootBounds.gltf")) {
        const buffer = new ArrayBuffer(152);
        const floats = new Float32Array(buffer);
        // Inverse bind matrices for Hips and Spine; Character_Group scales by
        // (2, 3, 1), then offsets Hips by 10 on x, so Hips world x is 23.
        floats.set([0.5, 0, 0, 0, 0, 1 / 3, 0, 0, 0, 0, 1, 0, -11.5, 0, 0, 1], 0);
        floats.set([0.5, 0, 0, 0, 0, 1 / 3, 0, 0, 0, 0, 1, 0, -11.5, 0, 0, 1], 16);
        floats.set([9, -3, -1, 11, 3, 1], 32);
        context.buffers = [buffer];
        return Promise.resolve({
          asset: {
            version: "2.0"
          },
          scene: 0,
          scenes: [
            {
              nodes: [0]
            }
          ],
          nodes: [
            {
              name: "Character_Group",
              translation: [3, 0, 0],
              scale: [2, 3, 1],
              children: [1, 2]
            },
            {
              name: "Character_Man",
              mesh: 0,
              skin: 0
            },
            {
              name: "mixamorig:Hips",
              translation: [10, 0, 0],
              children: [3]
            },
            {
              name: "mixamorig:Spine"
            }
          ],
          skins: [
            {
              inverseBindMatrices: 0,
              skeleton: 0,
              joints: [2, 3]
            }
          ],
          meshes: [
            {
              primitives: [
                {
                  attributes: {
                    POSITION: 1
                  },
                  mode: 4
                }
              ]
            }
          ],
          accessors: [
            {
              bufferView: 0,
              byteOffset: 0,
              componentType: 5126,
              count: 2,
              type: "MAT4"
            },
            {
              bufferView: 1,
              byteOffset: 0,
              componentType: 5126,
              count: 2,
              type: "VEC3",
              min: [9, -3, -1],
              max: [11, 3, 1]
            }
          ],
          bufferViews: [
            {
              buffer: 0,
              byteOffset: 0,
              byteLength: 128
            },
            {
              buffer: 0,
              byteOffset: 128,
              byteLength: 24
            }
          ],
          buffers: [
            {
              byteLength: 152
            }
          ]
        });
      }

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
          },
          {
            bufferView: 0,
            componentType: 5126,
            count: 3,
            type: "VEC4"
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
          },
          {
            sampler: 0,
            source: 0,
            name: "test"
          },
          {
            sampler: 0,
            source: 0,
            name: "test"
          },
          {
            sampler: 0,
            source: 0,
            name: "test"
          },
          {
            sampler: 0,
            source: 0,
            name: "specular intensity"
          },
          {
            sampler: 0,
            source: 0,
            name: "specular color"
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
          "KHR_materials_specular",
          "KHR_materials_clearcoat",
          "KHR_lights_punctual",
          "Custom_Material",
          "Custom_Light"
        ],
        extensionsRequired: ["KHR_materials_unlit", "KHR_materials_specular", "Custom_Material", "Custom_Light"],
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
                index: 3
              }
            },
            emissiveTexture: {
              index: 0
            },
            normalTexture: {
              index: 1,
              scale: 2
            },
            occlusionTexture: {
              index: 2,
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
            name: "custom blinn-phong",
            extensions: {
              Custom_Material: { baseColorFactor: [1, 1, 0, 1] }
            }
          },
          {
            name: "specular",
            pbrMetallicRoughness: {
              baseColorFactor: [1, 0, 0, 1],
              metallicFactor: 0.0,
              roughnessFactor: 0.2
            },
            extensions: {
              KHR_materials_specular: {
                specularFactor: 0.5,
                specularColorFactor: [1.0, 0.0, 0.0],
                specularTexture: {
                  index: 4
                },
                specularColorTexture: {
                  index: 5
                }
              }
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
                output: 2
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

afterAll(() => {
  @registerGLTFParser(GLTFParserType.Schema)
  class test extends GLTFSchemaParser {}
});

describe("glTF Loader test", function () {
  it("resolves external buffers in logical space before virtual mapping", async () => {
    const resourceManager = engine.resourceManager;
    const glTFVirtualPath = "Assets/Models/Hero.gltf";
    const bufferVirtualPath = "Assets/Buffers/Hero.bin";
    const glTFPhysicalPath = "blob:https://local.alipay.net/hero-gltf";
    const bufferPhysicalPath = "blob:https://local.alipay.net/hero-buffer";
    const buffer = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]).buffer;
    const glTF = {
      asset: { version: "2.0" },
      scene: 0,
      scenes: [{ nodes: [0] }],
      nodes: [{ mesh: 0 }],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 }, mode: 4 }] }],
      accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: "VEC3" }],
      bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: buffer.byteLength }],
      buffers: [{ byteLength: buffer.byteLength, uri: "../Buffers/Hero.bin" }]
    };
    const glTFBuffer = new TextEncoder().encode(JSON.stringify(glTF)).buffer;
    resourceManager.registerVirtualResources([
      { virtualPath: glTFVirtualPath, path: glTFPhysicalPath, type: AssetType.GLTF },
      { virtualPath: bufferVirtualPath, path: bufferPhysicalPath, type: AssetType.Buffer }
    ]);
    const requestSpy = vi.spyOn(resourceManager, "_requestByRemoteUrl").mockImplementation((url) => {
      if (url === glTFPhysicalPath) return AssetPromise.resolve(glTFBuffer) as any;
      if (url === bufferPhysicalPath) return AssetPromise.resolve(buffer) as any;
      return new AssetPromise((_resolve, reject) => reject(new Error(`Unexpected transport URL: ${url}`)));
    });
    let resource: GLTFResource;

    try {
      resource = await resourceManager.load(glTFVirtualPath);

      expect(requestSpy.mock.calls.map(([url]) => url)).toEqual([glTFPhysicalPath, bufferPhysicalPath]);
      const restorer = Object.values((resourceManager as any)._contentRestorerPool).find(
        (candidate: any) => candidate.resource === resource
      ) as any;
      expect(restorer.bufferRequests[0].url).toBe(bufferPhysicalPath);
    } finally {
      resource?.destroy();
      delete (resourceManager as any)._virtualPathResourceMap[glTFVirtualPath];
      delete (resourceManager as any)._virtualPathResourceMap[bufferVirtualPath];
      requestSpy.mockRestore();
    }
  });

  it("applies KHR_materials_emissive_strength to linear emissive RGB", async () => {
    const extension = "KHR_materials_emissive_strength";
    const emissiveFactor = [0.25, 0.5, 1];
    const image = document.createElement("canvas");
    image.width = image.height = 1;
    const glTF = {
      asset: { version: "2.0" },
      extensionsUsed: [extension],
      images: [{ uri: image.toDataURL() }],
      textures: [{ source: 0 }],
      materials: [
        { emissiveFactor, emissiveTexture: { index: 0 }, extensions: { [extension]: { emissiveStrength: 4 } } },
        { emissiveFactor, extensions: { [extension]: {} } },
        { emissiveFactor, extensions: { [extension]: { emissiveStrength: 0 } } },
        { extensions: { [extension]: { emissiveStrength: 4 } } },
        { emissiveFactor }
      ]
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(glTF)], { type: "model/gltf+json" }));
    let resource: GLTFResource;

    try {
      resource = await engine.resourceManager.load<GLTFResource>({ type: AssetType.GLTF, url });
      const materials = resource.materials as PBRMaterial[];

      expect(materials.map((material) => material.emissiveColor)).toEqual([
        new Color(1, 2, 4, 1),
        new Color(0.25, 0.5, 1, 1),
        new Color(0, 0, 0, 1),
        new Color(0, 0, 0, 1),
        new Color(0.25, 0.5, 1, 1)
      ]);
      expect(materials[0].emissiveTexture).toBe(resource.textures[0]);
      expect(materials[0].emissiveTexture.isSRGBColorSpace).toBe(true);
    } finally {
      resource?.destroy();
      URL.revokeObjectURL(url);
    }
  });

  it("samples flat glTF animation channels, sparse normalized rotations, morph remapping, and keyframe edits", async () => {
    const bytes = new ArrayBuffer(148);
    new Float32Array(bytes, 4, 8).set([0, 1, 1, 2, 3, 5, 6, 7]);
    new Int8Array(bytes, 36, 8).set([0, 0, 0, 127, 0, 0, 0, 127]);
    new Uint8Array(bytes)[44] = 1;
    new Int8Array(bytes, 48, 4).set([0, 0, -128, 0]);
    new Float32Array(bytes, 52, 6).set([0, 0, 2, 0, 1, 0]); // cubic weight: in, value, out
    new Float32Array(bytes, 76, 9).set([0, 0, 0, 1, 0, 0, 0, 1, 0]); // triangle
    new Float32Array(bytes, 112, 9).set([0, 0, 1, 0, 0, 1, 0, 0, 1]); // morph deltas
    const bufferUrl = URL.createObjectURL(new Blob([bytes]));
    const glTF = {
      asset: { version: "2.0" },
      scene: 0,
      scenes: [{ nodes: [0, 1, 2] }],
      nodes: [
        { name: "Actor", mesh: 0 },
        { name: "Twin", mesh: 0 },
        { name: "Wide", mesh: 1 }
      ],
      meshes: [1, 2].map((count) => ({
        weights: new Array<number>(count).fill(0),
        primitives: [{ attributes: { POSITION: 4 }, targets: Array.from({ length: count }, () => ({ POSITION: 5 })) }]
      })),
      buffers: [{ uri: bufferUrl, byteLength: bytes.byteLength }],
      bufferViews: [
        { buffer: 0, byteOffset: 4, byteLength: 32 },
        { buffer: 0, byteOffset: 36, byteLength: 8 },
        { buffer: 0, byteOffset: 44, byteLength: 1 },
        { buffer: 0, byteOffset: 48, byteLength: 4 },
        { buffer: 0, byteOffset: 52, byteLength: 24 },
        { buffer: 0, byteOffset: 76, byteLength: 36, target: 34962 },
        { buffer: 0, byteOffset: 112, byteLength: 36, target: 34962 }
      ],
      accessors: [
        { bufferView: 0, type: "SCALAR", componentType: 5126, count: 2, min: [0], max: [1] },
        { bufferView: 0, byteOffset: 8, type: "VEC3", componentType: 5126, count: 2 },
        {
          bufferView: 1,
          type: "VEC4",
          componentType: 5120,
          normalized: true,
          count: 2,
          sparse: { count: 1, indices: { bufferView: 2, componentType: 5121 }, values: { bufferView: 3 } }
        },
        { bufferView: 4, type: "SCALAR", componentType: 5126, count: 6 },
        { bufferView: 5, type: "VEC3", componentType: 5126, count: 3, min: [0, 0, 0], max: [1, 1, 0] },
        { bufferView: 6, type: "VEC3", componentType: 5126, count: 3, min: [0, 0, 1], max: [0, 0, 1] }
      ],
      animations: [
        {
          samplers: [
            { input: 0, output: 1 },
            { input: 0, output: 2, interpolation: "STEP" },
            { input: 0, output: 0 },
            { input: 0, output: 2, interpolation: "LINEAR" }
          ],
          channels: [
            { sampler: 0, target: { node: 0, path: "translation" } },
            { sampler: 0, target: { node: 0, path: "scale" } },
            { sampler: 1, target: { node: 0, path: "rotation" } },
            { sampler: 2, target: { node: 0, path: "weights" } },
            { sampler: 2, target: { node: 1, path: "weights" } },
            { sampler: 3, target: { node: 1, path: "rotation" } }
          ]
        },
        {
          samplers: [{ input: 0, output: 3, interpolation: "CUBICSPLINE" }],
          channels: [{ sampler: 0, target: { node: 0, path: "weights" } }]
        }
      ]
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(glTF)], { type: "model/gltf+json" }));
    let resource: GLTFResource | undefined;
    let instance: Entity | undefined;
    try {
      resource = await engine.resourceManager.load<GLTFResource>({ type: AssetType.GLTF, url });
      const clip = resource.animations![0];
      const [position, scale, rotation, weight, unplayedWeight, linearRotation] = clip.curveBindings.map(
        (binding) => binding.curve!
      );
      expect(clip.length).toBe(1);
      expect(position.keyCount).toBe(2);
      expect(position.evaluate(0.5)).toMatchObject({ x: 3, y: 4, z: 5 });

      // Mutating `position` copies on write and leaves `scale` (which shares sampler 0) isolated.
      const firstPos = position.getKey(0);
      (firstPos.value as Vector3).x = 11;
      position.setKey(0, firstPos);
      expect(position.evaluate(0.5)).toMatchObject({ x: 8, y: 4, z: 5 });
      scale.interpolation = InterpolationType.Step;
      expect(scale.evaluate(0.5)).toMatchObject({ x: 1, y: 2, z: 3 });

      expect(rotation.evaluate(0.5)).toMatchObject({ x: 0, y: 0, z: 0, w: 1 });
      expect(rotation.evaluate(1)).toMatchObject({ x: 0, y: 0, z: -1, w: 0 });
      const midLinearRot = linearRotation.evaluate(0.5) as Quaternion;
      expect(midLinearRot.x).toBeCloseTo(0, 5);
      expect(midLinearRot.y).toBeCloseTo(0, 5);
      expect(midLinearRot.z).toBeCloseTo(-Math.SQRT1_2, 5);
      expect(midLinearRot.w).toBeCloseTo(Math.SQRT1_2, 5);
      expect(linearRotation.evaluate(1)).toMatchObject({ x: 0, y: 0, z: -1, w: 0 });
      expect(weight.evaluate(0.5)).toEqual(new Float32Array([0.5]));
      const cubic = resource.animations![1].curveBindings[0].curve!;
      expect(cubic.evaluate(0)).toEqual(new Float32Array([0]));
      expect(cubic.evaluate(0.5)).toEqual(new Float32Array([0.75]));
      expect(cubic.evaluate(1)).toEqual(new Float32Array([1]));

      instance = resource.instantiateSceneRoot();
      const wide = instance.findByName("Wide")!;
      const renderer = wide.getComponent(SkinnedMeshRenderer)!;
      const seedCurve = new AnimationFloatArrayCurve();
      seedCurve.setKeys(new Float32Array([0, 1]), new Float32Array([0.75, 0.75, 0.75, 0.75]), false);
      const remapped = new AnimationClip("Retarget");
      remapped.addCurveBinding("", SkinnedMeshRenderer, "blendShapeWeights", seedCurve);
      for (const [curve, expected] of [
        [weight, 0.5],
        [cubic, 0.75]
      ] as const) {
        remapped.curveBindings[0].curve = seedCurve;
        remapped.sampleAnimation(wide, 0.5);
        expect(Array.from(renderer.blendShapeWeights)).toEqual([0.75, 0.75]);
        remapped.curveBindings[0].curve = curve;
        remapped.sampleAnimation(wide, 0.5);
        expect(Array.from(renderer.blendShapeWeights)).toEqual([expected, 0]);
      }
      remapped.destroy();
      expect(weight.getKey(1).value).toEqual(new Float32Array([1]));
      expect(weight.evaluate(0.75)).toEqual(new Float32Array([0.75]));

      const replacementTimes = new Float32Array([0, 1]);
      const replacementValues = new Float32Array([2, 3, 3, 4]);
      for (const curve of [weight, unplayedWeight]) {
        curve.setKeys(replacementTimes, replacementValues, false);
        expect(curve.evaluate(0.5)).toEqual(new Float32Array([2.5, 3.5]));
      }
    } finally {
      instance?.destroy();
      resource?.destroy();
      URL.revokeObjectURL(url);
      URL.revokeObjectURL(bufferUrl);
    }
  });

  it("samples glTF animations via playback, crossfade, and additive layers with flat curve normalization", async () => {
    const times = [0, 1];
    const transLinear = [0, 0, 0, 2, 4, 6];
    const rotLinear = [0, 0, 0, 1, 0, Math.SQRT1_2, 0, Math.SQRT1_2];
    const scaleCubic = [
      // key 0: inTangent, value, outTangent
      0, 0, 0, 1, 1, 1, 0, 4, 0,
      // key 1: inTangent, value, outTangent
      0, 0, 0, 2, 3, 4, 0, 0, 0
    ];
    const weightLinear = [0, 1, 1, 0];
    const transStep = [1, 2, 3, 5, 6, 7];
    const rotCubic = [
      // key 0: inTangent, value, outTangent
      0, 0, 0, 0, 0, 0, 0, 1, 0.2, 0.4, 0.6, 0.8,
      // key 1: inTangent, value, outTangent
      -0.2, -0.4, -0.6, -0.8, 0, 0, 1, 0, 0, 0, 0, 0
    ];
    const weightCubic = [
      // key 0 (2 morph targets): in, value, out
      0, 0, 0, 1, 0, 2,
      // key 1 (2 morph targets): in, value, out
      2, 0, 1, 0, 0, 0
    ];
    const triangle = [0, 0, 0, 1, 0, 0, 0, 1, 0];
    const delta0 = [0, 0, 1, 0, 0, 1, 0, 0, 1];
    const delta1 = [0, 1, 0, 0, 1, 0, 0, 1, 0];

    const floats = [
      ...times,
      ...transLinear,
      ...rotLinear,
      ...scaleCubic,
      ...weightLinear,
      ...transStep,
      ...rotCubic,
      ...weightCubic,
      ...triangle,
      ...delta0,
      ...delta1
    ];
    const bytes = new ArrayBuffer(floats.length * 4);
    new Float32Array(bytes).set(floats);

    const bufferViews: Array<{ buffer: number; byteOffset: number; byteLength: number; target?: number }> = [];
    const accessors: Array<{
      bufferView: number;
      type: string;
      componentType: number;
      count: number;
      min?: number[];
      max?: number[];
    }> = [];
    let floatOffset = 0;
    const addAccessor = (type: string, elementCount: number, count: number, isGeometry = false) => {
      const byteOffset = floatOffset * 4;
      const byteLength = count * elementCount * 4;
      floatOffset += count * elementCount;
      const viewIndex = bufferViews.length;
      bufferViews.push(
        isGeometry ? { buffer: 0, byteOffset, byteLength, target: 34962 } : { buffer: 0, byteOffset, byteLength }
      );
      const accessorIndex = accessors.length;
      const accessor: (typeof accessors)[number] = {
        bufferView: viewIndex,
        type,
        componentType: 5126,
        count
      };
      if (type === "SCALAR" && count === 2) {
        accessor.min = [0];
        accessor.max = [1];
      } else if (isGeometry) {
        accessor.min = [0, 0, 0];
        accessor.max = [1, 1, 1];
      }
      accessors.push(accessor);
      return accessorIndex;
    };

    const timesAcc = addAccessor("SCALAR", 1, 2);
    const transLinearAcc = addAccessor("VEC3", 3, 2);
    const rotLinearAcc = addAccessor("VEC4", 4, 2);
    const scaleCubicAcc = addAccessor("VEC3", 3, 6);
    const weightLinearAcc = addAccessor("SCALAR", 1, 4);
    const transStepAcc = addAccessor("VEC3", 3, 2);
    const rotCubicAcc = addAccessor("VEC4", 4, 6);
    const weightCubicAcc = addAccessor("SCALAR", 1, 12);
    const posAcc = addAccessor("VEC3", 3, 3, true);
    const target0Acc = addAccessor("VEC3", 3, 3, true);
    const target1Acc = addAccessor("VEC3", 3, 3, true);

    const bufferUrl = URL.createObjectURL(new Blob([bytes]));
    const glTF = {
      asset: { version: "2.0" },
      scene: 0,
      scenes: [{ nodes: [0] }],
      nodes: [{ name: "Actor", mesh: 0 }],
      meshes: [
        {
          weights: [0, 0],
          primitives: [
            { attributes: { POSITION: posAcc }, targets: [{ POSITION: target0Acc }, { POSITION: target1Acc }] }
          ]
        }
      ],
      buffers: [{ uri: bufferUrl, byteLength: bytes.byteLength }],
      bufferViews,
      accessors,
      animations: [
        {
          name: "base",
          samplers: [
            { input: timesAcc, output: transLinearAcc, interpolation: "LINEAR" },
            { input: timesAcc, output: rotLinearAcc, interpolation: "LINEAR" },
            { input: timesAcc, output: scaleCubicAcc, interpolation: "CUBICSPLINE" },
            { input: timesAcc, output: weightLinearAcc, interpolation: "LINEAR" }
          ],
          channels: [
            { sampler: 0, target: { node: 0, path: "translation" } },
            { sampler: 1, target: { node: 0, path: "rotation" } },
            { sampler: 2, target: { node: 0, path: "scale" } },
            { sampler: 3, target: { node: 0, path: "weights" } }
          ]
        },
        {
          name: "overlay",
          samplers: [
            { input: timesAcc, output: transStepAcc, interpolation: "STEP" },
            { input: timesAcc, output: rotCubicAcc, interpolation: "CUBICSPLINE" },
            { input: timesAcc, output: weightCubicAcc, interpolation: "CUBICSPLINE" }
          ],
          channels: [
            { sampler: 0, target: { node: 0, path: "translation" } },
            { sampler: 1, target: { node: 0, path: "rotation" } },
            { sampler: 2, target: { node: 0, path: "weights" } }
          ]
        }
      ]
    };

    const url = URL.createObjectURL(new Blob([JSON.stringify(glTF)], { type: "model/gltf+json" }));
    const rootEntity = engine.sceneManager.activeScene.createRootEntity();
    let resource: GLTFResource | undefined;
    try {
      resource = await engine.resourceManager.load<GLTFResource>({ type: AssetType.GLTF, url });
      const instance = resource.instantiateSceneRoot();
      rootEntity.addChild(instance);
      const actor = instance.findByName("Actor")!;
      const renderer = actor.getComponent(SkinnedMeshRenderer)!;
      const animator = instance.getComponent(Animator)!;
      const [baseClip, overlayClip] = resource.animations!;

      const additiveLayer = new AnimatorControllerLayer("additive");
      additiveLayer.blendingMode = AnimatorLayerBlendingMode.Additive;
      const additiveSM = new AnimatorStateMachine();
      const additiveState = additiveSM.addState("overlay");
      additiveState.clip = overlayClip;
      additiveState.wrapMode = WrapMode.Loop;
      additiveLayer.stateMachine = additiveSM;
      animator.animatorController.addLayer(additiveLayer);

      const stepAnimator = (deltaTime: number) => {
        (engine.time as any)._frameCount++;
        animator.update(deltaTime);
      };

      animator.play("base", 0);
      stepAnimator(0.5);
      expect(actor.transform.position.x).toBeCloseTo(1, 5);
      expect(actor.transform.scale.y).toBeCloseTo(2.5, 5);
      expect(actor.transform.rotationQuaternion.y).toBeCloseTo(Math.sin(Math.PI / 8), 5);
      expect(renderer.blendShapeWeights[0]).toBeCloseTo(0.5, 5);
      expect(renderer.blendShapeWeights[1]).toBeCloseTo(0.5, 5);

      animator.crossFade("overlay", 0.5, 0);
      stepAnimator(0.25);
      expect(actor.transform.position.x).toBeCloseTo(1.25, 5);
      animator.play("overlay", 1);
      stepAnimator(0.25);
      expect(Array.from(renderer.blendShapeWeights)).toEqual([0.3125, 0.875]);
      baseClip.sampleAnimation(instance, 0.4);
      expect(actor.transform.position.x).toBeCloseTo(0.8, 5);

      overlayClip.sampleAnimation(instance, 0.5);
      const { rotationQuaternion, scale, localMatrix } = actor.transform;
      const m = localMatrix.elements;
      // At t=0.5: raw (0.05, 0.1, 0.65, 0.7) normalized -> invLen = 1 / sqrt(0.925)
      const invNorm = 1 / Math.hypot(0.05, 0.1, 0.65, 0.7);
      expect(rotationQuaternion.x).toBeCloseTo(0.05 * invNorm, 5);
      expect(rotationQuaternion.y).toBeCloseTo(0.1 * invNorm, 5);
      expect(rotationQuaternion.z).toBeCloseTo(0.65 * invNorm, 5);
      expect(rotationQuaternion.w).toBeCloseTo(0.7 * invNorm, 5);
      expect(rotationQuaternion.length()).toBeCloseTo(1, 5);
      expect(Math.hypot(m[0], m[1], m[2])).toBeCloseTo(scale.x, 5);

      const [freshTrans, , freshCubicScale] = baseClip.curveBindings.map((b) => b.curve!);
      const freshStepTrans = overlayClip.curveBindings[0].curve!;

      freshCubicScale.interpolation = InterpolationType.Step;
      expect(freshCubicScale.evaluate(0.5)).toMatchObject({ x: 1, y: 1, z: 1 });
      freshCubicScale.interpolation = InterpolationType.Linear;
      expect(freshCubicScale.evaluate(0.5)).toMatchObject({ x: 1.5, y: 2, z: 2.5 });

      // Switching a tangent-less curve to CubicSpline falls back to p0 cleanly.
      freshTrans.interpolation = InterpolationType.CubicSpine;
      expect(freshTrans.evaluate(0.5)).toMatchObject({ x: 0, y: 0, z: 0 });

      // addKey and removeKey keep lengths and keyCount accurate on flat curves.
      const extraKey = new Keyframe<Vector3>();
      extraKey.time = 2;
      extraKey.value = new Vector3(9, 9, 9);
      freshStepTrans.addKey(extraKey);
      expect(freshStepTrans.length).toBe(2);
      expect(freshStepTrans.keyCount).toBe(3);
      freshStepTrans.removeKey(2);
      expect(freshStepTrans.keyCount).toBe(2);
      expect(freshStepTrans.length).toBe(1);
    } finally {
      rootEntity.destroy();
      resource?.destroy();
      URL.revokeObjectURL(url);
      URL.revokeObjectURL(bufferUrl);
    }
  });

  it("Pipeline Parser", async () => {
    const glTFResource: GLTFResource = await engine.resourceManager.load({
      type: AssetType.GLTF,
      url: "mock/path/testA.gltf"
    });
    const { materials, entities, defaultSceneRoot, textures, meshes } = glTFResource;
    const pbrMaterials = materials as PBRMaterial[];

    // material
    expect(pbrMaterials.length).to.equal(4);
    expect(pbrMaterials[0]).to.instanceOf(PBRMaterial);
    expect(pbrMaterials[1]).to.instanceOf(UnlitMaterial);
    expect(pbrMaterials[2]).to.instanceOf(BlinnPhongMaterial);

    expect(pbrMaterials[0].baseColor).to.deep.equal(new Color(1, 0, 0, 1));
    expect(pbrMaterials[0].emissiveColor).to.deep.equal(new Color(1, 1, 1, 1));
    expect(pbrMaterials[0].renderFace).to.equal(RenderFace.Double);
    expect(pbrMaterials[0].isTransparent).to.be.true;
    expect(pbrMaterials[0].clearCoat).to.equal(0.5);
    expect(pbrMaterials[0].clearCoatRoughness).to.equal(0.5);
    expect(pbrMaterials[1].baseColor).to.deep.equal(new Color(0, 1, 0, 1));
    expect(pbrMaterials[1].renderFace).to.equal(RenderFace.Front);
    expect(pbrMaterials[1].isTransparent).to.be.false;
    expect(pbrMaterials[2].baseColor).to.deep.equal(new Color(1, 1, 0, 1));
    expect(pbrMaterials[3].baseColor).to.deep.equal(new Color(1, 0, 0, 1));
    expect(pbrMaterials[3].specularIntensity).to.equal(0.5);
    expect(pbrMaterials[3].specularColor).to.deep.include({ r: 1, g: 0, b: 0 });

    // entity
    expect(entities.length).to.equal(2);
    expect(entities[0].transform.position).to.deep.include({ x: 1, y: 0, z: 0 });
    expect(entities[0].transform.rotationQuaternion).to.deep.include({ x: Math.PI, y: 0, z: 0, w: 0 });
    expect(entities[0].transform.scale).to.deep.include({ x: 2, y: 2, z: 2 });
    const directLight = entities[0].getComponent(SpotLight);
    expect(directLight).to.exist;
    expect(directLight.distance).to.equal(20);
    expect(directLight.color).to.deep.equal(new Color(0.5, 0, 0, 1));
    expect(directLight.angle).to.equal(Math.PI / 3);
    expect(directLight.penumbra).to.closeTo(Math.PI / 6, 1e-6);

    expect(entities[1].getComponent(PointLight)).to.exist;
    expect(defaultSceneRoot).to.instanceOf(Entity);

    // texture
    expect(textures.length).to.equal(6);
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
    expect(pbrMaterials[3].specularIntensityTexture).to.exist;
    expect(pbrMaterials[3].specularColorTexture).to.exist;
    expect(pbrMaterials[0].baseTexture.isSRGBColorSpace).to.be.true;
    expect(pbrMaterials[0].roughnessMetallicTexture.isSRGBColorSpace).to.be.false;
    expect(pbrMaterials[0].normalTexture.isSRGBColorSpace).to.be.false;
    expect(pbrMaterials[0].occlusionTexture.isSRGBColorSpace).to.be.false;
    expect(pbrMaterials[3].specularIntensityTexture.isSRGBColorSpace).to.be.false;
    expect(pbrMaterials[3].specularColorTexture.isSRGBColorSpace).to.be.true;

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

  it("single-root animation root channel should bind to the root node path", async () => {
    const glTFResource: GLTFResource = await engine.resourceManager.load({
      type: AssetType.GLTF,
      url: "mock/path/testA.gltf"
    });

    const clip = glTFResource.animations?.[0];
    expect(clip).to.exist;
    expect(clip.curveBindings[0].relativePath).to.equal("entity1");
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
    expect(meshes[0][0].destroyed).to.be.false;
    expect(meshes[0][0]._primitive.destroyed).to.be.false;
    expect(meshes[0][0].vertexBufferBindings[0]!.buffer.destroyed).to.be.false;

    // Test GC with no instance exist
    instance.destroy();
    engine.resourceManager.gc();
    glTFResourceCache = engine.resourceManager.getFromCache("mock/path/testB.gltf");
    expect(glTFResourceCache).to.be.null;
    expect(materials[0].destroyed).to.be.true;
    expect(meshes[0][0].destroyed).to.be.true;
    expect(meshes[0][0].vertexBufferBindings[0]!.buffer.destroyed).to.be.true;
    expect(glTFResource._defaultSceneRoot.destroyed).to.be.true;
  });
});

describe("glTF scene root structure", function () {
  it("Single root scene should have GLTF_ROOT container", async () => {
    const glTFResource: GLTFResource = await engine.resourceManager.load({
      type: AssetType.GLTF,
      url: "mock/path/testRoot.gltf"
    });
    const { defaultSceneRoot } = glTFResource;

    // Should always create GLTF_ROOT container, even for single-root scenes
    expect(defaultSceneRoot.name).to.equal("GLTF_ROOT");
    expect(defaultSceneRoot.children.length).to.equal(1);
    expect(defaultSceneRoot.children[0].name).to.equal("entity1");
  });

  it("Multi-root skins without skeleton should use the joints LCA as rootBone", async () => {
    const glTFResource: GLTFResource = await engine.resourceManager.load({
      type: AssetType.GLTF,
      url: "mock/path/testSkinRoot.gltf"
    });
    const { defaultSceneRoot, skins } = glTFResource;

    expect(defaultSceneRoot.name).to.equal("GLTF_ROOT");
    expect(defaultSceneRoot.children.length).to.equal(2);
    expect(skins[0].rootBone).to.not.equal(defaultSceneRoot);
    expect(skins[0].rootBone.name).to.equal("mixamorig:Hips");
  });

  it("Multi-root scenes whose joints converge to a single top-level root should not use the scene wrapper", async () => {
    const glTFResource: GLTFResource = await engine.resourceManager.load({
      type: AssetType.GLTF,
      url: "mock/path/testSingleSkeleton.gltf"
    });
    const { defaultSceneRoot, skins } = glTFResource;

    expect(defaultSceneRoot.name).to.equal("GLTF_ROOT");
    expect(defaultSceneRoot.children.length).to.equal(2);
    expect(skins[0].rootBone).to.not.equal(defaultSceneRoot);
    expect(skins[0].rootBone.name).to.equal("Character_Root");
  });

  it("Skinned mesh bounds should stay in scaled rootBone space when explicit rootBone is outside joints", async () => {
    const glTFResource: GLTFResource = await engine.resourceManager.load({
      type: AssetType.GLTF,
      url: "mock/path/testSkinRootBounds.gltf"
    });
    const { defaultSceneRoot, skins } = glTFResource;
    const characterGroup = defaultSceneRoot.children[0];
    const characterMesh = characterGroup.children[0];
    const renderer = characterMesh.getComponent(SkinnedMeshRenderer);

    expect(skins[0].rootBone).to.equal(characterGroup);
    expect(renderer).to.exist;
    expect(renderer.localBounds.min.x).to.be.closeTo(3, 1e-5);
    expect(renderer.localBounds.max.x).to.be.closeTo(4, 1e-5);
    expect(renderer.localBounds.min.y).to.be.closeTo(-1, 1e-5);
    expect(renderer.localBounds.max.y).to.be.closeTo(1, 1e-5);
    expect(renderer.bounds.min.x).to.be.closeTo(9, 1e-5);
    expect(renderer.bounds.max.x).to.be.closeTo(11, 1e-5);
    expect(renderer.bounds.min.y).to.be.closeTo(-3, 1e-5);
    expect(renderer.bounds.max.y).to.be.closeTo(3, 1e-5);
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
    const templateRoot = glTFResource._defaultSceneRoot;
    glTFResource.destroy();
    expect(glTFResource.destroyed).to.be.true;
    expect(templateRoot.destroyed).to.be.true;

    // Test destroy glTFResource directly with glTFResource already destroyed
    expect(materials[0].destroyed).to.be.false;
    materials[0].destroy();
    expect(materials[0].destroyed).to.be.true;
  });

  it("GLTFResource isGCIgnored retains all sub-resources across gc() and sweeps cleanly once released", async () => {
    engine.resourceManager.gc();
    const referPool = (engine.resourceManager as any)._referResourcePool as Record<number, object>;
    const graphicPool = (engine.resourceManager as any)._graphicResourcePool as Record<number, object>;
    const referBefore = Object.keys(referPool).length;
    const graphicBefore = Object.keys(graphicPool).length;

    const glTFResource: GLTFResource = await engine.resourceManager.load({
      type: AssetType.GLTF,
      url: "mock/path/testB.gltf"
    });
    glTFResource.isGCIgnored = true;
    const mesh = glTFResource.meshes![0][0];
    const vertexBuffer = mesh.vertexBufferBindings[0]!.buffer;

    engine.resourceManager.gc();
    expect(glTFResource.destroyed).to.be.false;
    expect(glTFResource.materials![0].destroyed).to.be.false;
    expect(mesh.destroyed).to.be.false;
    expect(mesh._primitive.destroyed).to.be.false;
    expect(vertexBuffer.destroyed).to.be.false;

    glTFResource.isGCIgnored = false;
    glTFResource.destroy();
    engine.resourceManager.gc();

    expect(glTFResource.destroyed).to.be.true;
    expect(glTFResource._defaultSceneRoot.destroyed).to.be.true;
    expect(glTFResource.materials![0].destroyed).to.be.true;
    expect(mesh.destroyed).to.be.true;
    expect(vertexBuffer.destroyed).to.be.true;
    expect(Object.keys(referPool).length).to.equal(referBefore);
    expect(Object.keys(graphicPool).length).to.equal(graphicBefore);
  });

  it("protects in-flight GLTFResource allocations from concurrent gc() and cleans up on cancel", async () => {
    engine.resourceManager.gc();
    const referPool = (engine.resourceManager as any)._referResourcePool as Record<number, object>;
    const graphicPool = (engine.resourceManager as any)._graphicResourcePool as Record<number, object>;
    const referBefore = Object.keys(referPool).length;
    const graphicBefore = Object.keys(graphicPool).length;

    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const bufferUri = `data:application/octet-stream;base64,${btoa(
      String.fromCharCode(...new Uint8Array(positions.buffer))
    )}`;
    const delayedUri = "https://mock.local/delayed-gc-test.bin";
    const gltfUrl = URL.createObjectURL(
      new Blob(
        [
          JSON.stringify({
            asset: { version: "2.0" },
            buffers: [
              { uri: bufferUri, byteLength: positions.byteLength },
              { uri: delayedUri, byteLength: positions.byteLength }
            ],
            bufferViews: [
              { buffer: 0, byteOffset: 0, byteLength: positions.byteLength },
              { buffer: 1, byteOffset: 0, byteLength: positions.byteLength }
            ],
            accessors: [
              { componentType: 5126, count: 3, type: "VEC3", bufferView: 0, min: [0, 0, 0], max: [1, 1, 0] },
              { componentType: 5126, count: 3, type: "VEC3", bufferView: 1, min: [0, 0, 0], max: [1, 1, 0] }
            ],
            materials: [{ pbrMetallicRoughness: { baseColorFactor: [1, 0, 0, 1] } }],
            meshes: [
              { primitives: [{ attributes: { POSITION: 0 }, material: 0 }] },
              { primitives: [{ attributes: { POSITION: 1 }, material: 0 }] }
            ],
            nodes: [{ mesh: 0 }, { mesh: 1 }],
            scenes: [{ nodes: [0, 1] }],
            scene: 0
          })
        ],
        { type: "model/gltf+json" }
      )
    );

    const originalRequest = (engine.resourceManager as any)._requestByRemoteUrl;
    let resolveDelayed!: (buf: ArrayBuffer) => void;
    let markRequested!: () => void;
    const requested = new Promise<void>((resolve) => {
      markRequested = resolve;
    });
    const requestSpy = vi.spyOn(engine.resourceManager as any, "_requestByRemoteUrl").mockImplementation(function (
      this: any,
      url: string,
      config: any
    ) {
      if (url === delayedUri) {
        markRequested();
        return new AssetPromise<ArrayBuffer>((resolve) => {
          resolveDelayed = resolve;
        });
      }
      return originalRequest.call(this, url, config);
    });

    try {
      // Case 1: gc() during in-flight parse must not destroy in-flight allocations
      const waitForPartialAllocations = async () => {
        for (let i = 0; i < 50; i++) {
          if (Object.keys(referPool).length > referBefore && Object.keys(graphicPool).length > graphicBefore) return;
          await new Promise((resolve) => setTimeout(resolve, 2));
        }
        expect(Object.keys(referPool).length).to.be.greaterThan(referBefore);
        expect(Object.keys(graphicPool).length).to.be.greaterThan(graphicBefore);
      };
      const loadingOk = engine.resourceManager.load<GLTFResource>({ type: AssetType.GLTF, url: gltfUrl });
      await requested;
      await waitForPartialAllocations();
      // Half-parsed GLTFResource must not be exposed to findResourcesByType() before load resolves
      expect(engine.resourceManager.findResourcesByType(GLTFResource).some((r) => r.url === gltfUrl)).to.be.false;
      engine.resourceManager.gc();
      resolveDelayed(positions.buffer.slice(0));
      const loaded = await loadingOk;
      expect(engine.resourceManager.findResourcesByType(GLTFResource)).to.include(loaded);
      expect(loaded.destroyed).to.be.false;
      expect(loaded.isGCIgnored).to.be.false;
      expect(loaded.meshes![0][0].destroyed).to.be.false;
      expect(loaded.meshes![0][0].vertexBufferBindings[0]!.buffer.destroyed).to.be.false;
      loaded.destroy();
      engine.resourceManager.gc();
      expect(Object.keys(referPool).length).to.equal(referBefore);
      expect(Object.keys(graphicPool).length).to.equal(graphicBefore);

      // Case 2: canceling in-flight parse releases partial allocations even if delayed buffer resolves later
      const requestedCancel = new Promise<void>((resolve) => {
        markRequested = resolve;
      });
      const loadingCancel = engine.resourceManager.load<GLTFResource>({ type: AssetType.GLTF, url: gltfUrl });
      await requestedCancel;
      await waitForPartialAllocations();
      loadingCancel.cancel();
      await expect(loadingCancel).rejects.toBe("canceled");
      resolveDelayed(positions.buffer.slice(0));
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(Object.keys(referPool).length).to.equal(referBefore);
      expect(Object.keys(graphicPool).length).to.equal(graphicBefore);

      // Case 3: canceling during an active frame (_frameInProcess = true) still releases partial allocations on frame flush
      const requestedInFrame = new Promise<void>((resolve) => {
        markRequested = resolve;
      });
      const loadingInFrame = engine.resourceManager.load<GLTFResource>({ type: AssetType.GLTF, url: gltfUrl });
      await requestedInFrame;
      await waitForPartialAllocations();
      (engine as any)._frameInProcess = true;
      try {
        loadingInFrame.cancel();
      } finally {
        (engine as any)._frameInProcess = false;
      }
      await expect(loadingInFrame).rejects.toBe("canceled");
      (engine as any)._processPendingDestroyObjects();
      resolveDelayed(positions.buffer.slice(0));
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(Object.keys(referPool).length).to.equal(referBefore);
      expect(Object.keys(graphicPool).length).to.equal(graphicBefore);
    } finally {
      requestSpy.mockRestore();
      URL.revokeObjectURL(gltfUrl);
    }
  });

  it("preserves external cached URI textures and remapped materials when an in-flight glTF load is canceled", async () => {
    engine.resourceManager.gc();
    const sharedTexture = new Texture2D(engine, 2, 2);
    const sharedTextureUrl = "https://mock.local/shared-external.png";
    engine.resourceManager._addAsset(sharedTextureUrl, sharedTexture);

    const remappedMaterial = new PBRMaterial(engine);
    const remappedMaterialUrl = "virtual://shared-remapped-material";
    engine.resourceManager._objectPool[remappedMaterialUrl] = remappedMaterial;

    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const bufferUri = `data:application/octet-stream;base64,${btoa(
      String.fromCharCode(...new Uint8Array(positions.buffer))
    )}`;
    const delayedUri = "https://mock.local/delayed-external-preserve.bin";
    const gltfUrl = URL.createObjectURL(
      new Blob(
        [
          JSON.stringify({
            asset: { version: "2.0" },
            buffers: [
              { uri: bufferUri, byteLength: positions.byteLength },
              { uri: delayedUri, byteLength: positions.byteLength }
            ],
            bufferViews: [
              { buffer: 0, byteOffset: 0, byteLength: positions.byteLength },
              { buffer: 1, byteOffset: 0, byteLength: positions.byteLength }
            ],
            accessors: [
              { componentType: 5126, count: 3, type: "VEC3", bufferView: 0, min: [0, 0, 0], max: [1, 1, 0] },
              { componentType: 5126, count: 3, type: "VEC3", bufferView: 1, min: [0, 0, 0], max: [1, 1, 0] }
            ],
            images: [{ uri: sharedTextureUrl }],
            textures: [{ source: 0 }],
            materials: [
              {
                extensions: {
                  GALACEAN_materials_remap: { url: remappedMaterialUrl }
                }
              },
              {
                pbrMetallicRoughness: {
                  baseColorTexture: { index: 0 },
                  metallicRoughnessTexture: { index: 0 }
                },
                normalTexture: { index: 0 },
                occlusionTexture: { index: 0 },
                emissiveTexture: { index: 0 },
                extensions: {
                  KHR_materials_clearcoat: {
                    clearcoatFactor: 1,
                    clearcoatTexture: { index: 0 },
                    clearcoatRoughnessTexture: { index: 0 },
                    clearcoatNormalTexture: { index: 0 }
                  },
                  KHR_materials_sheen: {
                    sheenColorTexture: { index: 0 },
                    sheenRoughnessTexture: { index: 0 }
                  },
                  KHR_materials_specular: {
                    specularTexture: { index: 0 },
                    specularColorTexture: { index: 0 }
                  },
                  KHR_materials_transmission: {
                    transmissionFactor: 0.5,
                    transmissionTexture: { index: 0 }
                  },
                  KHR_materials_anisotropy: {
                    anisotropyStrength: 0.5,
                    anisotropyTexture: { index: 0 }
                  },
                  KHR_materials_iridescence: {
                    iridescenceFactor: 0.5,
                    iridescenceTexture: { index: 0 },
                    iridescenceThicknessTexture: { index: 0 }
                  },
                  KHR_materials_volume: {
                    thicknessFactor: 0.5,
                    thicknessTexture: { index: 0 }
                  }
                }
              }
            ],
            meshes: [
              { primitives: [{ attributes: { POSITION: 0 }, material: 0 }] },
              { primitives: [{ attributes: { POSITION: 1 }, material: 1 }] }
            ],
            nodes: [{ mesh: 0 }, { mesh: 1 }],
            scenes: [{ nodes: [0, 1] }],
            scene: 0
          })
        ],
        { type: "model/gltf+json" }
      )
    );

    const originalRequest = (engine.resourceManager as any)._requestByRemoteUrl;
    let resolveDelayed!: (buf: ArrayBuffer) => void;
    let markRequested!: () => void;
    const requested = new Promise<void>((resolve) => {
      markRequested = resolve;
    });
    const requestSpy = vi.spyOn(engine.resourceManager as any, "_requestByRemoteUrl").mockImplementation(function (
      this: any,
      url: string,
      config: any
    ) {
      if (url === delayedUri) {
        markRequested();
        return new AssetPromise<ArrayBuffer>((resolve) => {
          resolveDelayed = resolve;
        });
      }
      return originalRequest.call(this, url, config);
    });

    try {
      const loading = engine.resourceManager.load<GLTFResource>({ type: AssetType.GLTF, url: gltfUrl });
      await requested;
      // Wait for material 0 (remapped), material 1 (owned + clearcoat), and shared texture association to complete
      await new Promise((resolve) => setTimeout(resolve, 20));

      loading.cancel();
      await expect(loading).rejects.toBe("canceled");
      resolveDelayed(positions.buffer.slice(0));
      await new Promise((resolve) => setTimeout(resolve, 20));

      // External shared assets must survive abort and remain cached with no dangling superResource association
      expect(sharedTexture.destroyed).to.be.false;
      expect(engine.resourceManager.getFromCache(sharedTextureUrl)).to.equal(sharedTexture);
      expect(remappedMaterial.destroyed).to.be.false;
      expect((sharedTexture as any)._superResources?.size ?? 0).to.equal(0);
      expect((remappedMaterial as any)._superResources?.size ?? 0).to.equal(0);
    } finally {
      requestSpy.mockRestore();
      URL.revokeObjectURL(gltfUrl);
      delete engine.resourceManager._objectPool[remappedMaterialUrl];
      sharedTexture.destroy(true);
      remappedMaterial.destroy(true);
    }
  });

  it("keeps aborted in-frame glTF hidden while pendingDestroy and clears _isLoading if retained", async () => {
    engine.resourceManager.gc();
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const bufferUri = `data:application/octet-stream;base64,${btoa(
      String.fromCharCode(...new Uint8Array(positions.buffer))
    )}`;
    const delayedUri = "https://mock.local/delayed-in-frame-cancel.bin";
    const gltfUrl = URL.createObjectURL(
      new Blob(
        [
          JSON.stringify({
            asset: { version: "2.0" },
            buffers: [
              { uri: bufferUri, byteLength: positions.byteLength },
              { uri: delayedUri, byteLength: positions.byteLength }
            ],
            bufferViews: [
              { buffer: 0, byteOffset: 0, byteLength: positions.byteLength },
              { buffer: 1, byteOffset: 0, byteLength: positions.byteLength }
            ],
            accessors: [
              { componentType: 5126, count: 3, type: "VEC3", bufferView: 0, min: [0, 0, 0], max: [1, 1, 0] },
              { componentType: 5126, count: 3, type: "VEC3", bufferView: 1, min: [0, 0, 0], max: [1, 1, 0] }
            ],
            meshes: [
              { primitives: [{ attributes: { POSITION: 0 } }] },
              { primitives: [{ attributes: { POSITION: 1 } }] }
            ],
            nodes: [{ mesh: 0 }, { mesh: 1 }],
            scenes: [{ nodes: [0, 1] }],
            scene: 0
          })
        ],
        { type: "model/gltf+json" }
      )
    );

    const originalRequest = (engine.resourceManager as any)._requestByRemoteUrl;
    let resolveDelayed!: (buf: ArrayBuffer) => void;
    let markRequested!: () => void;
    let requested = new Promise<void>((resolve) => {
      markRequested = resolve;
    });
    const requestSpy = vi.spyOn(engine.resourceManager as any, "_requestByRemoteUrl").mockImplementation(function (
      this: any,
      url: string,
      config: any
    ) {
      if (url === delayedUri) {
        markRequested();
        return new AssetPromise<ArrayBuffer>((resolve) => {
          resolveDelayed = resolve;
        });
      }
      return originalRequest.call(this, url, config);
    });

    const referPool = (engine.resourceManager as any)._referResourcePool;
    const referBefore = Object.keys(referPool).length;

    try {
      // 1. In-frame cancel: pending-destroy glTFResource stays hidden from findResourcesByType until end-of-frame flush
      const loading = engine.resourceManager.load<GLTFResource>({ type: AssetType.GLTF, url: gltfUrl });
      await requested;
      await new Promise((resolve) => setTimeout(resolve, 20));

      (engine as any)._frameInProcess = true;
      try {
        loading.cancel();
        expect(engine.resourceManager.findResourcesByType(GLTFResource).some((r) => r.url === gltfUrl)).to.be.false;
        (engine as any)._processPendingDestroyObjects();
      } finally {
        (engine as any)._frameInProcess = false;
      }

      await expect(loading).rejects.toBe("canceled");
      resolveDelayed(positions.buffer.slice(0));
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(Object.keys(referPool).length).to.equal(referBefore);

      // 2. If glTFResource is retained by an active reference during cancel(), destroy() returns false and _isLoading resets
      requested = new Promise<void>((resolve) => {
        markRequested = resolve;
      });
      const loading2 = engine.resourceManager.load<GLTFResource>({ type: AssetType.GLTF, url: gltfUrl });
      await requested;
      await new Promise((resolve) => setTimeout(resolve, 20));

      const inFlight = Object.values(referPool).find(
        (r: any) => r instanceof GLTFResource && r.url === gltfUrl
      ) as GLTFResource;
      expect(inFlight).to.exist;
      expect((inFlight as any)._isLoading).to.be.true;
      inFlight._addReferCount(1);

      loading2.cancel();
      await expect(loading2).rejects.toBe("canceled");
      expect(inFlight.destroyed).to.be.false;
      expect((inFlight as any)._isLoading).to.be.false;
      expect(engine.resourceManager.findResourcesByType(GLTFResource)).to.include(inFlight);

      inFlight._addReferCount(-1);
      inFlight.destroy();
      resolveDelayed(positions.buffer.slice(0));
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(Object.keys(referPool).length).to.equal(referBefore);
    } finally {
      requestSpy.mockRestore();
      URL.revokeObjectURL(gltfUrl);
    }
  });
});
