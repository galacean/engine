/**
 * @title Camera Depth Texture
 * @category Camera
 * @thumbnail https://mdn.alipayobjects.com/merchant_appfe/afts/img/A*Zg1mRbLWEVMAAAAAAAAAAAAADiR2AQ/original
 */

import {
  AmbientLight,
  AssetType,
  BaseMaterial,
  Camera,
  Color,
  DepthTextureMode,
  DirectLight,
  Engine,
  Entity,
  FogMode,
  GLTFResource,
  MeshRenderer,
  PrimitiveMesh,
  RenderFace,
  Shader,
  ShadowType,
  Vector3,
  WebGLEngine,
} from "@galacean/engine";
import { FreeControl } from "@galacean/engine-toolkit-controls";

async function main() {
  const engine = await WebGLEngine.create({ canvas: "canvas" });
  engine.canvas.resizeByClientSize();

  const scene = engine.sceneManager.activeScene;

  // Set background color to corn flower blue
  const cornFlowerBlue = new Color(130 / 255, 163 / 255, 255 / 255);
  scene.background.solidColor = cornFlowerBlue;

  // Set fog
  scene.fogMode = FogMode.ExponentialSquared;
  scene.fogDensity = 0.015;
  scene.fogEnd = 200;
  scene.fogColor = cornFlowerBlue;

  const rootEntity = scene.createRootEntity();

  // Create camera entity and components
  const cameraEntity = rootEntity.createChild("camera");
  cameraEntity.transform.setPosition(-6, 2, -22);
  cameraEntity.transform.rotate(new Vector3(0, -110, 0));
  cameraEntity.addComponent(FreeControl).floorMock = false;

  const camera = cameraEntity.addComponent(Camera);
  camera.depthTextureMode = DepthTextureMode.PrePass;

  // Create light entity and component
  const lightEntity = rootEntity.createChild("light");
  lightEntity.transform.setPosition(0, 0.7, 0.5);
  lightEntity.transform.lookAt(new Vector3(0, 0, 0));

  // Enable light cast shadow
  const directLight = lightEntity.addComponent(DirectLight);
  directLight.shadowType = ShadowType.SoftLow;

  // Add ambient light
  const ambientLight = await engine.resourceManager.load<AmbientLight>({
    url: "https://gw.alipayobjects.com/os/bmw-prod/09904c03-0d23-4834-aa73-64e11e2287b0.bin",
    type: AssetType.Env,
  });
  scene.ambientLight = ambientLight;

  // Add model
  const glTFResource = await engine.resourceManager.load<GLTFResource>(
    "https://gw.alipayobjects.com/os/OasisHub/19748279-7b9b-4c17-abdf-2c84f93c54c8/oasis-file/1670226408346/low_poly_scene_forest_waterfall.gltf"
  );
  rootEntity.addChild(glTFResource.defaultSceneRoot);

  showDepthPlane(engine, cameraEntity);

  engine.run();
}

function showDepthPlane(engine: Engine, camera: Entity): void {
  const entity = camera.createChild("Plane");
  entity.transform.setPosition(0, 0, -1);
  entity.transform.rotate(new Vector3(90, 0, 0));
  const renderer = entity.addComponent(MeshRenderer);
  renderer.mesh = PrimitiveMesh.createPlane(engine,0.5,0.5);

  // Create material
  const material = new BaseMaterial(engine, Shader.find("RenderDepthTexture"));
  renderer.setMaterial(material);
}

const renderDepthVS = `
    #include <common>
    #include <common_vert>
    #include <blendShape_input>
    #include <uv_share>
    #include <FogVertexDeclaration>

    void main() {
        #include <begin_position_vert>
        #include <blendShape_vert>
        #include <skinning_vert>
        #include <uv_vert>
        #include <position_vert>

        #include <FogVertex>
    }`;

const renderDepthFS = `
    #include <common>
    #include <uv_share>
    #include <FogFragmentDeclaration>

    uniform sampler2D camera_DepthTexture;

    void main() {
        float nonLinearDepth = texture2D(camera_DepthTexture, v_uv).r;
        float depth = remapDepthBufferLinear01(nonLinearDepth);

        vec4 baseColor = vec4(depth, depth, depth, 1.0);
        gl_FragColor = baseColor;

        #ifndef MATERIAL_IS_TRANSPARENT
            gl_FragColor.a = 1.0;
        #endif

        #include <FogFragment>

        gl_FragColor = linearToGamma(gl_FragColor);
    }`;

Shader.create("RenderDepthTexture", renderDepthVS, renderDepthFS);

main();
