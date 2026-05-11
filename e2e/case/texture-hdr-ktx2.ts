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
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { initScreenshot, updateForE2E } from "./.mockForE2E";

Logger.enable();

const shaderCompiler = new ShaderCompiler();

const shaderSource = `Shader "test-hdr" {
  SubShader "Default" {
    Pass "Forward" {
      struct Attributes {
        vec3 POSITION;
        vec2 TEXCOORD_0;
      };

      struct Varyings {
        vec2 uv;
      };

      mat4 renderer_MVPMat;
      sampler2D material_BaseTexture;

      VertexShader = vert;
      FragmentShader = frag;

      Varyings vert(Attributes attr) {
        Varyings v;
        gl_Position = renderer_MVPMat * vec4(attr.POSITION, 1.0);
        v.uv = attr.TEXCOORD_0;
        return v;
      }

      vec4 frag(Varyings v) {
        vec4 color = texture2D(material_BaseTexture, v.uv);
        return color - vec4(1, 1, 1, 0);
      }
    }
  }
}`;

WebGLEngine.create({ canvas: "canvas", shaderCompiler, ktx2Loader: { workerCount: 0 } }).then((engine) => {
  engine.canvas.resizeByClientSize(2);
  const scene = engine.sceneManager.activeScene;
  const rootEntity = scene.createRootEntity();

  // camera
  const cameraEntity = rootEntity.createChild("camera_node");
  cameraEntity.transform.position = new Vector3(0, 1, 5);
  const camera = cameraEntity.addComponent(Camera);
  cameraEntity.transform.lookAt(new Vector3(0, 0, 0));

  const lightNode = rootEntity.createChild("light_node");
  lightNode.transform.lookAt(new Vector3(0, 0, 1));
  lightNode.transform.rotate(new Vector3(0, 90, 0));

  const planeEntity = rootEntity.createChild("plane");
  const meshRenderer = planeEntity.addComponent(MeshRenderer);
  meshRenderer.mesh = PrimitiveMesh.createCuboid(engine);
  const mtl = new Material(engine, Shader.create(shaderSource));
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
