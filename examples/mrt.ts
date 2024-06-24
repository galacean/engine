/**
 * @title Multiple Render Targets
 * @category Advance
 * @thumbnail https://mdn.alipayobjects.com/merchant_appfe/afts/img/A*mzsETqwXuPIAAAAAAAAAAAAADiR2AQ/original
 */
import {
  Camera,
  CullMode,
  DirectLight,
  GLTFResource,
  Layer,
  Material,
  MeshRenderer,
  PrimitiveMesh,
  RenderTarget,
  Script,
  Shader,
  Texture2D,
  TextureFilterMode,
  TextureFormat,
  UnlitMaterial,
  Vector3,
  WebGLEngine,
} from "@galacean/engine";
import { OrbitControl } from "@galacean/engine-toolkit";

WebGLEngine.create({ canvas: "canvas" }).then((engine) => {
  engine.canvas.resizeByClientSize();

  const scene = engine.sceneManager.activeScene;
  const rootEntity = scene.createRootEntity();
  const cameraEntity = rootEntity.createChild("camera");
  const camera = cameraEntity.addComponent(Camera);
  camera.cullingMask = Layer.Layer0;
  cameraEntity.transform.setPosition(0, 0, 5);
  const control = cameraEntity.addComponent(OrbitControl);
  control.minDistance = 3;
  camera.scene.ambientLight.diffuseSolidColor.set(1, 1, 1, 1);

  const lightEntity = rootEntity.createChild();
  lightEntity.addComponent(DirectLight);
  lightEntity.transform.lookAt(new Vector3(0, 0, 0));

  const width = engine.canvas.width;
  const height = engine.canvas.height;

  const positionTexture = new Texture2D(engine, width, height);
  const depthTexture = new Texture2D(engine, width, height);
  const normalTexture = new Texture2D(engine, width, height);
  const autoDepthTexture = new Texture2D(
    engine,
    width,
    height,
    TextureFormat.Depth,
    false
  );
  autoDepthTexture.filterMode = TextureFilterMode.Point;
  const renderTarget = new RenderTarget(
    engine,
    width,
    height,
    [positionTexture, depthTexture, normalTexture],
    autoDepthTexture
  );

  const positionPlaneEntity = createPlane(positionTexture);
  positionPlaneEntity.transform.setPosition(0, 3, -6);
  const depthPlaneEntity = createPlane(depthTexture);
  depthPlaneEntity.transform.setPosition(0, 1, -6);
  const normalEntity = createPlane(normalTexture);
  normalEntity.transform.setPosition(0, -1, -6);
  const autoDepthEntity = createPlane(autoDepthTexture);
  autoDepthEntity.transform.setPosition(0, -3, -6);

  const mrtMatrial = getMRTMaterial();
  mrtMatrial.renderState.rasterState.cullMode = CullMode.Off;

  class mrtScript extends Script {
    private materialMap: Array<{ renderer: MeshRenderer; material: Material }> =
      [];
    private rendererList: Array<MeshRenderer> = [];

    onBeginRender(camera: Camera): void {
      this.materialMap.length = 0;
      this.rendererList.length = 0;
      rootEntity.getComponentsIncludeChildren(MeshRenderer, this.rendererList);
      for (let i = 0; i < this.rendererList.length; i++) {
        const renderer = this.rendererList[i];
        if (renderer.entity.layer === Layer.Layer1) continue;
        const material = renderer.getMaterial();
        if (material) {
          this.materialMap.push({ renderer: this.rendererList[i], material });
          renderer.setMaterial(mrtMatrial);
        }
      }

      camera.renderTarget = renderTarget;
      camera.render();
      camera.renderTarget = null;
      this.materialMap.forEach(({ renderer, material }) => {
        renderer.setMaterial(material);
      });
    }
  }
  cameraEntity.addComponent(mrtScript);
  createWindowCamera();

  engine.resourceManager
    .load<GLTFResource>(
      "https://gw.alipayobjects.com/os/bmw-prod/150e44f6-7810-4c45-8029-3575d36aff30.gltf"
    )
    .then((gltf) => {
      const { defaultSceneRoot } = gltf;
      rootEntity.addChild(defaultSceneRoot);

      engine.run();
    });

  function getMRTMaterial() {
    const vertex = `
    uniform mat4 renderer_MVPMat;
    uniform mat4 renderer_ModelMat;
    varying vec4 worldPos; 
    varying vec4 normal;
    attribute vec3 NORMAL;
    attribute vec3 POSITION; 
    void main() {
      worldPos = renderer_ModelMat * vec4(POSITION, 1.0);
      normal = renderer_ModelMat * vec4(NORMAL, 1.0);
      gl_Position = renderer_MVPMat * vec4(POSITION, 1.0);
    }`;
    const frag = `
    varying vec4 worldPos;
    varying vec4 normal;
    void main() {
      gl_FragData[0] = vec4(worldPos.xyz, 1.0);
      gl_FragData[1] = vec4(vec3(worldPos.z), 1.0);
      gl_FragData[2] = vec4(normal.xyz, 1.0);
    }
    `;

    const shader = Shader.create("MRT", vertex, frag);
    return new Material(engine, shader);
  }

  function createPlane(texture: Texture2D) {
    const entity = rootEntity.createChild();
    entity.transform.setRotation(90, 0, 0);
    entity.layer = Layer.Layer1;
    const renderer = entity.addComponent(MeshRenderer);
    renderer.mesh = PrimitiveMesh.createPlane(engine, 2, (2 * height) / width);
    const material = new UnlitMaterial(engine);
    material.baseTexture = texture;
    renderer.setMaterial(material);

    return entity;
  }

  function createWindowCamera() {
    const windowEntity = scene.createRootEntity();
    windowEntity.layer = Layer.Layer1;
    const windowCameraEntity = windowEntity.createChild("window-camera");
    const windowCamera = windowCameraEntity.addComponent(Camera);
    windowCamera.cullingMask = Layer.Layer1;
    windowCamera.viewport.set(0.7, 0.0, 0.3, 0.7);
    windowCameraEntity.transform.setPosition(0, 0, 3);
  }
});
