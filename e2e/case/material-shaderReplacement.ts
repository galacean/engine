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
import { initScreenshot, updateForE2E } from "./.mockForE2E";
import { E2E_CONFIG } from "../config";

/**
 * Main function.
 */
async function main() {
  Logger.enable();

  initShader();

  // Create engine
  const engine = await WebGLEngine.create({ canvas: "canvas" });
  engine.canvas.resizeByClientSize();

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
        type: AssetType.Env,
        url: "https://gw.alipayobjects.com/os/bmw-prod/f369110c-0e33-47eb-8296-756e9c80f254.bin"
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
        type: AssetType.Texture2D
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

      const { category, caseFileName } = E2E_CONFIG["material-shaderReplacement"];
      initScreenshot(category, caseFileName, engine, camera);
    });
}
main();

/**
 * Init replacement shader.
 */
function initShader() {
  const normalVS = `
  #include <common>
  #include <common_vert>
  #include <blendShape_input>
  #include <normal_share>
  
  void main() {
  
      #include <begin_position_vert>
      #include <begin_normal_vert>
      #include <blendShape_vert>
      #include <skinning_vert>
      #include <normal_vert>
      #include <position_vert>
  }`;

  const normalFS = `
  #include <common>
  #include <normal_share>
  
  void main() {
   gl_FragColor = vec4(v_normal,1.0);
  }
  `;

  const uvCheckVS = `
  #include <common>
  #include <common_vert>
  #include <blendShape_input>
  #include <uv_share>
  
  void main() {
  
    #include <begin_position_vert>
    #include <blendShape_vert>
    #include <skinning_vert>
    #include <uv_vert>
    #include <position_vert>
  }`;

  const uvCheckFS = `
  #include <common>
  #include <uv_share>
  
  uniform sampler2D u_UVCheckTexture;
  
  void main() {
    vec4 textureColor = texture2D(u_UVCheckTexture, v_uv);
    gl_FragColor = textureColor;
  }
  `;

  // Create normal shader
  Shader.create("NormalShader", normalVS, normalFS);
  // Create uv check shader
  Shader.create("UVCheckShader", uvCheckVS, uvCheckFS);
}
