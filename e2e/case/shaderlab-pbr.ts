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
  PrimitiveMesh,
  Shader,
  SkyBoxMaterial,
  Texture2D,
  Vector3
} from "@galacean/engine";
import { WebGLEngine } from "@galacean/engine-rhi-webgl";
import { registerIncludes } from "@galacean/engine-shader-shaderlab";
import { initScreenshot, updateForE2E } from "./.mockForE2E";
import { ShaderLab } from "@galacean/engine-shaderlab";

const shaderLab = new ShaderLab();
registerIncludes();

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

        DepthState {
          WriteEnabled = depthWriteEnabled;
        }

        BlendState {
          Enabled = blendEnabled;
          SourceColorBlendFactor = sourceColorBlendFactor;
          DestinationColorBlendFactor = destinationColorBlendFactor;
          SourceAlphaBlendFactor = sourceAlphaBlendFactor;
          DestinationAlphaBlendFactor = destinationAlphaBlendFactor;
        }

        RasterState{
          CullMode = rasterStateCullMode;
        }

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
