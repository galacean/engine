/**
 * @title ShaderLab PBR
 * @category Material
 */

import {
  AmbientLight,
  AssetType,
  BackgroundMode,
  Camera,
  GLTFResource,
  Loader,
  Logger,
  PrimitiveMesh,
  Shader,
  SkyBoxMaterial,
  Texture2D,
  Vector3
} from "@galacean/engine";
import { WebGLEngine } from "@galacean/engine-rhi-webgl";
import { registerIncludes } from "@galacean/engine-shader";
import { initScreenshot, updateForE2E } from "./.mockForE2E";
import { ShaderLab } from "@galacean/engine-shaderlab";

Logger.enable();

const shaderLab = new ShaderLab();
registerIncludes();

// const pbrShaderSource = `Shader "Water" {

//   EditorProperties {
//     u_color( "Main Color", Color ) = ( 0, 1, 0, 1 );
//     u_range( "Test Range", Range( 1, 100, 3 ) ) = 10;
//     u_mode( "Mode Toggle", Boolean ) = true;
//     u_texture( "Texture", Texture2D );
//     u_texture2( "TextureCube", TextureCube );
//   }

//   DepthState depthState {
//     Enabled = true;
//     WriteEnabled = false;
//     CompareFunction = CompareFunction.Greater;
//   }

//   RasterState rasterState {
//     CullMode = CullMode.Front;
//     DepthBias = 0.1;
//     SlopeScaledDepthBias = 0.8;
//   }

//   SubShader "subname" {
//     Tags { LightMode = "ForwardBase" }

//     BlendFactor material_SrcBlend;

//     BlendState {
//       SourceAlphaBlendFactor = material_SrcBlend;
//       Enabled[0] = true;
//       ColorWriteMask[0] = 0.8;
//       BlendColor = Color(1.0, 1.0, 1.0, 1.0);
//       AlphaBlendOperation = BlendOperation.Max;
//     }

//     UsePass "pbr/Default/Forward"

//     Pass "default" {
//       Tags { ReplacementTag = "Opaque", pipelineStage = "DepthOnly"}

//       RenderQueueType = customRenderQueue;

//       struct a2v {
//        vec4 POSITION;
//        vec2 TEXCOORD_0; 
//        mat3 TBN;
//       };

//       struct v2f {
//        vec2 v_uv;
//        vec3 v_position;
//       };

//       mat4 renderer_MVPMat;
//       mat4 renderer_MVMat;

//       sampler2D material_BaseTexture;
//       vec4 u_color;
//       vec4 u_fogColor;
//       float u_fogDensity;

//       vec4 linearToGamma(vec4 linearIn) {
//           return vec4(pow(linearIn.rgb, vec3(1.0 / 2.2)), linearIn.a);
//     }

//     StencilState {
//       Enabled = true;
//       ReferenceValue = 2;
//       Mask = 1.3; // 0xffffffff
//       WriteMask = 0.32; // 0xffffffff
//       CompareFunctionFront = CompareFunction.Less;
//       PassOperationBack = StencilOperation.Zero;
//     }

//     DepthState = depthState;
//     RasterState = rasterState;

//     RenderQueueType = Opaque;

//     /* First comment */
//       /* Second comment */

//     #define SCENE_SHADOW_TYPE 3

//     /*Comment without leading space*/

//     // test global declaration list.
//     vec2 v1, v2[2], v3[3];

//       v2f vert(a2v v) {
//         v2f o;

//         vec2 weights[2], offsets[2];
//         weights[0] = vec2(.1);
//         offsets[1] = vec2(.1);

//         float[2] c;
//         c[0] = 1.0;
//         c[1] = .4;

//         o.v_uv = v.TEXCOORD_0;
//         vec4 tmp = renderer_MVMat * v.POSITION;
//         o.v_position = tmp.xyz;
//         gl_Position = renderer_MVPMat * v.POSITION;
//         vec3 tangentW = v.TBN[0];
//         return o;
//       }

//       struct FsphericalGaussian {
//             vec3 Axis;  //u
//             vec3 Sharpness; //L
//             vec3 Amplitude; //a
//         };

//         // Normalized sg
//         FsphericalGaussian makeNormalizedSG(vec3 lightdir , vec3 sharpness)
//         {
//           FsphericalGaussian sg;
//           sg.Axis = lightdir;
//           sg.Sharpness = sharpness;
//           sg.Amplitude = sg.Sharpness /((2.0 * 1.) * (1.0 - exp(-2.0 * sg.Sharpness)));
//           return sg;
//         }
          
//         vec3 sgdiffuseLighting(vec3 light ,vec3 normal ,vec3 scatterAmt)
//         {
//           FsphericalGaussian Kernel = makeNormalizedSG(light, 1.0 / max(scatterAmt.xyz,0.0001));
//           return vec3(1.0);
//         }

//       /* This is a
//       multi-line comment */

//       void frag(v2f i) {
//         vec4 color = texture2D(material_BaseTexture, i.v_uv) * u_color;

//         float fogDistance = length(i.v_position);
//         float fogAmount = 1.0 - exp2(-u_fogDensity * u_fogDensity * fogDistance * fogDistance * 1.442695);
//         fogAmount = clamp(fogAmount, 0.0, 1.0);
//         gl_FragColor = mix(color, u_fogColor, fogAmount); 
  
//         gl_FragColor = linearToGamma(gl_FragColor);


// #define REFRACTION_MODE

// #if REFRACTION_MODE == 1

// #endif

//         // For testing only (macro)
//         #if SCENE_SHADOW_TYPE == 2 || defined(XX_Macro)
//           gl_FragColor = linearToGamma(gl_FragColor);
//         #elif SCENE_SHADOW_TYPE == 3
//           gl_FragColor = linearToGamma(gl_FragColor);
//         #else 
//           gl_FragColor = vec4(1.0, 1.0, 0.0, 0.0);
//         #endif

//         #undef SCENE_SHADOW_TYPE

//         #ifndef SCENE_SHADOW_TYPE
//           gl_FragColor = vec4(sgdiffuseLighting(vec3(1.0), vec3(1.0), vec3(1.0)), 1.0);
//         #else
//           gl_FragColor = vec4(1.0, 1.0, 0.0, 0.0);
//         #endif 

//         #ifdef SCENE_SHADOW_TYPE
//           gl_FragColor = vec4(1.0, 1.0, 0.0, 0.0);
//         #endif 
//       }

//       VertexShader = vert;
//       FragmentShader = frag;
//     }
//     UsePass "blinn-phong/Default/Forward"
//   }
// }`;

const pbrShaderSource = `Shader "PBRShaderName" {
  Editor {
    Properties{
      Header("Base"){
        material_IOR("IOR", Range(0, 5, 0.01)) = 1.5;
        material_BaseColor("BaseColor", Color) = (1, 1, 1, 1);
        material_BaseTexture("BaseTexture", Texture2D);
      }

      Header("Metal Roughness") {
        material_Metal( "Metal", Range(0,1,0.01) ) = 1;
        material_Roughness( "Roughness", Range( 0, 1, 0.01 ) ) = 1;
        material_RoughnessMetallicTexture("RoughnessMetallicTexture", Texture2D);
      }

      Header("Anisotropy") {
        anisotropy("Intensity", Range(0, 1, 0.01)) = 0;
        anisotropyRotation("Rotation", Range(0, 360, 1)) = 0;
        material_AnisotropyTexture("Texture", Texture2D);
      }

      Header("Normal") {
        material_NormalTexture("NormalTexture", Texture2D);
        material_NormalIntensity("NormalIntensity", Range(0, 5, 0.01)) = 1;
      }

      Header("Emissive") {
        material_EmissiveColor("EmissiveColor", HDRColor ) = (0, 0, 0, 1);
        material_EmissiveTexture("EmissiveTexture", Texture2D);
      }

      Header("Occlusion") {
        material_OcclusionTexture("OcclusionTexture", Texture2D);
        material_OcclusionIntensity("OcclusionIntensity", Range(0, 5, 0.01)) = 1;
        material_OcclusionTextureCoord("OcclusionTextureCoord", Float) = 0;
      }
      
      Header("Clear Coat") {
        material_ClearCoat("ClearCoat", Range(0, 1, 0.01)) = 0;
        material_ClearCoatTexture("ClearCoatTexture", Texture2D);
        material_ClearCoatRoughness("ClearCoatRoughness", Range(0, 1, 0.01)) = 0;
        material_ClearCoatRoughnessTexture("ClearCoatRoughnessTexture", Texture2D);
        material_ClearCoatNormalTexture("ClearCoatNormalTexture", Texture2D);
      }

      Header("Thin Film Iridescence"){
        iridescence("Iridescence", Range(0, 1, 0.01)) = 0;
        iridescenceIOR("IOR", Range(1, 5, 0.01)) = 1.3;
        iridescenceRange("ThicknessRange", Vector2) = (100, 400);
        material_IridescenceThicknessTexture("ThicknessTexture", Texture2D);
        material_IridescenceTexture("IridescenceTexture", Texture2D);
      }

      Header("Sheen"){
        sheenColor("Color", Color ) = (0, 0, 0, 1);
        sheenIntensity("Intensity", Range(0, 1, 0.01)) = 1;
        material_SheenRoughness("Roughness", Range(0, 1, 0.01)) = 0;
        material_SheenTexture("ColorTexture", Texture2D);
        material_SheenRoughnessTexture("RoughnessTexture", Texture2D);
      }

      Header("Transmission") {
        material_Transmission("Transmission", Range(0, 1, 0.01)) = 0;
        material_TransmissionTexture("TransmissionTexture", Texture2D);
        material_Thickness("Thickness", Range(0, 5, 0.01)) = 0;
        material_ThicknessTexture("ThicknessTexture", Texture2D);
        refractionMode("RefractionMode", Enum(Sphere:0, Planar:1)) = 1;
        material_AttenuationColor("AttenuationColor", Color ) = (1, 1, 1, 1);
        material_AttenuationDistance("AttenuationDistance", Range(0, 1, 0.01)) = 0;
      }

      Header("Common") {
        isTransparent("Transparent", Boolean) = false;
        renderFace("Render Face", Enum(Front:0, Back:1, Double:2)) = 0;
        blendMode("Blend Mode", Enum(Normal:0, Additive:1)) = 0;
        material_AlphaCutoff( "AlphaCutoff", Range(0, 1, 0.01) ) = 0;
        material_TilingOffset("TilingOffset", Vector4) = (1, 1, 0, 0);
      }
    }
      
    UIScript "UIScriptPath";
  }
        
    SubShader "Default" {
      UsePass "pbr/Default/ShadowCaster"

      Pass "Forward Pass" {
        Tags { pipelineStage = "Forward"} 

        RenderQueueType renderQueueType;
        BlendFactor sourceColorBlendFactor;
        BlendFactor destinationColorBlendFactor;
        BlendFactor sourceAlphaBlendFactor;
        BlendFactor destinationAlphaBlendFactor;
        CullMode rasterStateCullMode;
        Bool blendEnabled;
        Bool depthWriteEnabled;

        DepthState customDepthState {
          WriteEnabled = depthWriteEnabled;
        }

        BlendState customBlendState {
          Enabled = blendEnabled;
          SourceColorBlendFactor = sourceColorBlendFactor;
          DestinationColorBlendFactor = destinationColorBlendFactor;
          SourceAlphaBlendFactor = sourceAlphaBlendFactor;
          DestinationAlphaBlendFactor = destinationAlphaBlendFactor;
        }

        RasterState customRasterState {
          CullMode = rasterStateCullMode;
        }

        BlendState = customBlendState;
        DepthState = customDepthState;
        RasterState = customRasterState;
        RenderQueueType = renderQueueType;

        #define IS_METALLIC_WORKFLOW
        
        VertexShader = PBRVertex;
        FragmentShader = PBRFragment;

        #include "ForwardPassPBR.glsl"
      }
    }
  }`;

WebGLEngine.create({ canvas: "canvas", shaderLab }).then((engine) => {
  const shaderLabPBR = Shader.create(pbrShaderSource);
  engine.canvas.resizeByClientSize();

  const scene = engine.sceneManager.activeScene;
  const rootEntity = scene.createRootEntity();

  //Create camera
  const cameraNode = rootEntity.createChild("camera_node");
  cameraNode.transform.position.set(4, 0, 6);
  cameraNode.transform.lookAt(new Vector3(1, 0, 0));
  const camera = cameraNode.addComponent(Camera);

  Promise.all([
    engine.resourceManager
      .load<GLTFResource>("https://gw.alipayobjects.com/os/bmw-prod/a1da72a4-023e-4bb1-9629-0f4b0f6b6fc4.glb")
      .then((glTF) => {

        // Replace shader to shaderLab PBR
        const material = glTF.materials[0];
        material.shader = shaderLabPBR;
        const shaderData = material.shaderData;
        shaderData.setInt("depthWriteEnabled", 1);

        const defaultSceneRoot = glTF.instantiateSceneRoot();
        rootEntity.addChild(defaultSceneRoot);
        return glTF;
      }),
    engine.resourceManager
      .load<AmbientLight>({
        type: AssetType.Env,
        url: "https://gw.alipayobjects.com/os/bmw-prod/89c54544-1184-45a1-b0f5-c0b17e5c3e68.bin"
      })
      .then((ambientLight) => {
        scene.ambientLight = ambientLight;
        const sky = scene.background.sky;
        const skyMaterial = new SkyBoxMaterial(engine);
        scene.background.mode = BackgroundMode.Sky;

        sky.material = skyMaterial;
        sky.mesh = PrimitiveMesh.createCuboid(engine, 1, 1, 1);
        skyMaterial.texture = ambientLight.specularTexture;
        skyMaterial.textureDecodeRGBM = true;
        return ambientLight;
      }),
    engine.resourceManager.load<Texture2D>({
      type: AssetType.Texture2D,
      url: "https://mdn.alipayobjects.com/huamei_dmxymu/afts/img/A*tMeTQ4Mx60oAAAAAAAAAAAAADuuHAQ/original"
    })
  ]).then((resArray) => {
    engine.run();
    // updateForE2E(engine);

    // initScreenshot(engine, camera);
  });
});
