/**
 * @title HDR KTX2
 * @category Texture
 */
import {
  AssetType,
  Camera,
  Logger,
  Material,
  MeshRenderer,
  PrimitiveMesh,
  Shader,
  Texture2D,
  Vector3,
  WebGLEngine
} from "@galacean/engine";
import { OrbitControl } from "@galacean/engine-toolkit";
import { initScreenshot, updateForE2E } from "./.mockForE2E";

Logger.enable();

WebGLEngine.create({ canvas: "canvas", ktx2Loader: { workerCount: 0 } }).then((engine) => {
  engine.canvas.resizeByClientSize(2);
  const scene = engine.sceneManager.activeScene;
  const rootEntity = scene.createRootEntity();

  // camera
  const cameraEntity = rootEntity.createChild("camera_node");
  cameraEntity.transform.position = new Vector3(0, 1, 5);
  const camera = cameraEntity.addComponent(Camera);
  cameraEntity.addComponent(OrbitControl).target = new Vector3(0, 0, 0);

  const lightNode = rootEntity.createChild("light_node");
  lightNode.transform.lookAt(new Vector3(0, 0, 1));
  lightNode.transform.rotate(new Vector3(0, 90, 0));

  const planeEntity = rootEntity.createChild("plane");
  const meshRenderer = planeEntity.addComponent(MeshRenderer);
  meshRenderer.mesh = PrimitiveMesh.createCuboid(engine);
  const mtl = new Material(
    engine,
    Shader.create(
      "test-hdr",
      `
    attribute vec3 POSITION;
    attribute vec2 TEXCOORD_0;
    uniform mat4 renderer_MVPMat;
    varying vec2 v_uv;

    void main() {
      gl_Position = renderer_MVPMat * vec4(POSITION, 1.0);
      v_uv = TEXCOORD_0;
    }
    `,
      `
    uniform sampler2D material_BaseTexture;
    varying vec2 v_uv;

    void main(){
      vec4 color = texture(material_BaseTexture, v_uv);
      gl_FragColor = color - vec4(1, 1, 1, 0);
    }
    `
    )
  );
  meshRenderer.setMaterial(mtl);

  engine.resourceManager
    .load<Texture2D>({
      type: AssetType.KTX2,
      url: "https://mdn.alipayobjects.com/rms/afts/img/A*6lCwQrgPpSEAAAAAXRAAAAgAehQnAQ/original/autumn_field_puresky_1k.ktx2"
    })
    .then((tex) => {
      mtl.shaderData.setTexture("material_BaseTexture", tex);
      updateForE2E(engine);

      initScreenshot(engine, camera);
    });
});
