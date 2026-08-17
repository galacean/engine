/**
 * @title Shader Replacement
 * @category Material
 */
import {
  AmbientLight,
  AssetType,
  Camera,
  DirectLight,
  GLTFResource,
  Logger,
  Shader,
  Texture2D,
  WebGLEngine
} from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { initScreenshot, updateForE2E } from "./.mockForE2E";

/**
 * Main function.
 */
async function main() {
  Logger.enable();

  // Create engine
  const engine = await WebGLEngine.create({ canvas: "canvas", shaderCompiler: new ShaderCompiler() });

  initShader();

  // Get scene and create root entity
  const scene = engine.sceneManager.activeScene;
  const rootEntity = scene.createRootEntity();

  // Create directional light
  const directLightEntity = rootEntity.createChild("Directional Light");
  directLightEntity.addComponent(DirectLight);
  directLightEntity.transform.setRotation(30, 0, 0);

  const directLightEntity2 = rootEntity.createChild("Directional Light2");
  directLightEntity2.addComponent(DirectLight);
  directLightEntity2.transform.setRotation(-30, 180, 0);

  // Create camera
  const cameraEntity = rootEntity.createChild("Camera");
  cameraEntity.transform.setPosition(0, 0, 5);
  const camera = cameraEntity.addComponent(Camera);

  engine.resourceManager
    .load([
      {
        type: AssetType.AmbientLight,
        url: "https://mdn.alipayobjects.com/oasis_be/afts/file/A*eRJ8QKzf5zAAAAAAgBAAAAgAekp5AQ/ambient.ambLight"
      },
      {
        url: "https://gw.alipayobjects.com/os/bmw-prod/150e44f6-7810-4c45-8029-3575d36aff30.gltf",
        type: AssetType.GLTF
      },
      {
        url: "https://gw.alipayobjects.com/os/OasisHub/267000040/9994/%25E5%25BD%2592%25E6%25A1%25A3.gltf",
        type: AssetType.GLTF
      },
      {
        url: "https://mdn.alipayobjects.com/huamei_b4l2if/afts/img/A*Q60vQ40ZERsAAAAAAAAAAAAADil6AQ/original",
        type: AssetType.Texture
      }
    ])
    .then((resources) => {
      // Add ambient light
      const ambientLight = <AmbientLight>resources[0];
      scene.ambientLight = ambientLight;

      // Add helmet model
      const glTFResourceHelmet = <GLTFResource>resources[1];
      const helmetEntity = glTFResourceHelmet.defaultSceneRoot;
      helmetEntity.transform.position.set(-1, 0, 0);
      rootEntity.addChild(helmetEntity);

      // Add duck model
      const glTFResourceDuck = <GLTFResource>resources[2];
      const duckEntity = glTFResourceDuck.defaultSceneRoot;
      duckEntity.transform.position.set(1, -1, 0);
      rootEntity.addChild(duckEntity);

      // Apply uv check texture
      const uvCheckTexture = <Texture2D>resources[3];
      for (const material of glTFResourceHelmet.materials!) {
        material.shaderData.setTexture("u_UVCheckTexture", uvCheckTexture);
      }
      for (const material of glTFResourceDuck.materials!) {
        material.shaderData.setTexture("u_UVCheckTexture", uvCheckTexture);
      }

      camera.setReplacementShader(Shader.find("UVCheckShader"));
      updateForE2E(engine);

      initScreenshot(engine, camera);
    });
}
main();

/**
 * Init replacement shader.
 */
function initShader() {
  Shader.create(`
    Shader "NormalShader" {
      SubShader "Default" {
        Pass "Forward" {
          Tags { pipelineStage = "Forward", ReplacementTag = "transparent" }

          #include "ShaderLibrary/Common/Common.glsl"
          #include "ShaderLibrary/Common/Transform.glsl"
          #include "ShaderLibrary/Common/Attributes.glsl"
          #include "ShaderLibrary/Skin/Skin.glsl"
          #include "ShaderLibrary/Skin/BlendShape.glsl"

          struct Varyings {
            vec3 v_normal;
          };

          Varyings vert(Attributes attr) {
            Varyings v;

            vec4 position = vec4(attr.POSITION, 1.0);

            #ifdef RENDERER_HAS_NORMAL
              vec3 normal = vec3(attr.NORMAL);
            #endif

            #ifdef RENDERER_HAS_BLENDSHAPE
              calculateBlendShape(attr, position
                #ifdef RENDERER_HAS_NORMAL
                  , normal
                #endif
              );
            #endif

            #ifdef RENDERER_HAS_SKIN
              mat4 skinMatrix = getSkinMatrix(attr);
              position = skinMatrix * position;
              #ifdef RENDERER_HAS_NORMAL
                normal = normal * INVERSE_MAT(mat3(skinMatrix));
              #endif
            #endif

            gl_Position = renderer_MVPMat * position;
            #ifdef RENDERER_HAS_NORMAL
              v.v_normal = normalize(mat3(renderer_NormalMat) * normal);
            #endif
            return v;
          }

          void frag(Varyings v) {
            gl_FragColor = vec4(v.v_normal, 1.0);
          }

          VertexShader = vert;
          FragmentShader = frag;
        }
      }
    }
  `);

  Shader.create(`
    Shader "UVCheckShader" {
      SubShader "Default" {
        Pass "Forward" {
          Tags { pipelineStage = "Forward", ReplacementTag = "transparent" }

          #include "ShaderLibrary/Common/Common.glsl"
          #include "ShaderLibrary/Common/Transform.glsl"
          #include "ShaderLibrary/Common/Attributes.glsl"
          #include "ShaderLibrary/Skin/Skin.glsl"
          #include "ShaderLibrary/Skin/BlendShape.glsl"

          sampler2D u_UVCheckTexture;

          struct Varyings {
            vec2 v_uv;
          };

          Varyings vert(Attributes attr) {
            Varyings v;

            vec4 position = vec4(attr.POSITION, 1.0);

            #ifdef RENDERER_HAS_BLENDSHAPE
              calculateBlendShape(attr, position);
            #endif

            #ifdef RENDERER_HAS_SKIN
              mat4 skinMatrix = getSkinMatrix(attr);
              position = skinMatrix * position;
            #endif

            gl_Position = renderer_MVPMat * position;
            #ifdef RENDERER_HAS_UV
              v.v_uv = attr.TEXCOORD_0;
            #endif
            return v;
          }

          void frag(Varyings v) {
            vec4 textureColor = texture2D(u_UVCheckTexture, v.v_uv);
            gl_FragColor = textureColor;
          }

          VertexShader = vert;
          FragmentShader = frag;
        }
      }
    }
  `);
}
