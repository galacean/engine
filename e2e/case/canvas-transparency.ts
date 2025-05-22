/**
 * @title Transparency
 * @category Canvas
 */
import {
  AntiAliasing,
  AssetType,
  BackgroundMode,
  BackgroundTextureFillMode,
  BlendFactor,
  BlendMode,
  BlendOperation,
  Camera,
  Color,
  Engine,
  Layer,
  Logger,
  MeshRenderer,
  PrimitiveMesh,
  RenderTarget,
  Scene,
  Texture2D,
  TextureFormat,
  UnlitMaterial,
  Vector3,
  WebGLEngine
} from "@galacean/engine";
import { initScreenshot, updateForE2E } from "./.mockForE2E";

Logger.enable();
WebGLEngine.create({ canvas: "canvas", graphicDeviceOptions: { alpha: false } }).then((engine) => {
  engine.canvas.resizeByClientSize(2);

  engine.resourceManager
    .load([
      {
        url: "https://mdn.alipayobjects.com/huamei_kz4wfo/afts/img/A*3d2oSbam_wcAAAAAAAAAAAAAesp6AQ/original",
        type: AssetType.Texture2D
      },
      {
        url: "https://mdn.alipayobjects.com/huamei_qbugvr/afts/img/A*j6MERb-exVgAAAAAAAAAAAAADtKFAQ/original",
        type: AssetType.Texture2D
      }
    ])
    .then((resources) => {
      const transparencyTexture = resources[1] as Texture2D;
      const sceneColorTexture = createMainScene(engine, transparencyTexture);

      // Simulate transparency canvas
      const canvasScene = new Scene(engine);
      const canvasRootEntity = canvasScene.createRootEntity();
      engine.sceneManager.addScene(canvasScene);

      // Background
      const backgroundTexture = resources[0] as Texture2D;
      canvasScene.background.mode = BackgroundMode.Texture;
      canvasScene.background.textureFillMode = BackgroundTextureFillMode.Fill;
      canvasScene.background.texture = backgroundTexture;

      // Camera
      const canvasCameraEntity = canvasRootEntity.createChild("Big Plane Camera");
      canvasCameraEntity.transform.position = new Vector3(0, 0, 2.5);
      const canvasCamera = canvasCameraEntity.addComponent(Camera);
      canvasCamera.priority -= 1;

      // Create material
      const canvasMaterial = new UnlitMaterial(engine);
      canvasMaterial.baseTexture = sceneColorTexture;

      // Use premultiplied blend mode to simulate canvas transparency blending
      canvasMaterial.isTransparent = true;
      const target = canvasMaterial.renderState.blendState.targetBlendState;
      target.sourceColorBlendFactor = BlendFactor.One;
      target.destinationColorBlendFactor = BlendFactor.OneMinusSourceAlpha;
      target.colorBlendOperation = BlendOperation.Add;

      // This setup is to simulate canvas transparency blending with browser
      // Browser don't care alpha, but need to avoid 0,we use dest(is 1.0)
      // Zero also will cause can't revert un-premultiplied color in sRGB Pass in this simulation mode
      target.sourceAlphaBlendFactor = BlendFactor.Zero;
      target.destinationAlphaBlendFactor = BlendFactor.One;
      target.alphaBlendOperation = BlendOperation.Add;

      // Use big plane to simulate transparency canvas
      const canvasPlaneEntity = canvasRootEntity.createChild("Plane");
      canvasPlaneEntity.transform.setPosition(0, 0, 0);
      canvasPlaneEntity.transform.rotate(new Vector3(90, 0, 0));
      const renderer = canvasPlaneEntity.addComponent(MeshRenderer);
      renderer.mesh = PrimitiveMesh.createPlane(engine, 2, 2);
      renderer.setMaterial(canvasMaterial);

      updateForE2E(engine);
      initScreenshot(engine, canvasCamera);
    });
});

function createMainScene(engine: Engine, transparencyTexture: Texture2D): Texture2D {
  const scene = engine.sceneManager.activeScene;
  const rootEntity = scene.createRootEntity();

  // Background
  scene.background.solidColor = new Color(1.0, 0, 0, 0.2);

  // Camera
  const cameraEntity = rootEntity.createChild("Scene Camera");
  cameraEntity.transform.position = new Vector3(0, 0, 3);
  const sceneCamera = cameraEntity.addComponent(Camera);
  const renderColorTexture = new Texture2D(engine, 512, 512, TextureFormat.R8G8B8A8, false, false);
  const renderTarget = new RenderTarget(engine, 512, 512, renderColorTexture);
  sceneCamera.renderTarget = renderTarget;
  sceneCamera.antiAliasing = AntiAliasing.FXAA;

  // Plane
  const planeEntity = rootEntity.createChild("Plane");
  planeEntity.transform.setPosition(0, 0, 0);
  planeEntity.transform.rotate(new Vector3(90, 0, 0));
  const planeRenderer = planeEntity.addComponent(MeshRenderer);
  planeRenderer.mesh = PrimitiveMesh.createPlane(engine, 1);

  const planeMaterial = new UnlitMaterial(engine);
  planeMaterial.baseTexture = transparencyTexture;
  planeMaterial.isTransparent = true;
  planeMaterial.blendMode = BlendMode.Additive;
  planeRenderer.setMaterial(planeMaterial);

  // Sphere
  const cubeEntity = rootEntity.createChild("Cube");
  cubeEntity.transform.setPosition(-1, 0, 0);
  cubeEntity.transform.rotate(new Vector3(0, 0, 15));
  const sphereRenderer = cubeEntity.addComponent(MeshRenderer);
  sphereRenderer.mesh = PrimitiveMesh.createCuboid(engine, 1);

  const sphereMaterial = new UnlitMaterial(engine);
  sphereRenderer.setMaterial(sphereMaterial);

  return renderColorTexture;
}
