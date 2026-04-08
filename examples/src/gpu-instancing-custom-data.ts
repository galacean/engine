/**
 * @title GPU Instancing Custom Data
 * @category Mesh
 * @thumbnail https://mdn.alipayobjects.com/merchant_appfe/afts/img/A*jjZMTrp-vU8AAAAAAAAAAAAADiR2AQ/original
 */
import { OrbitControl } from "@galacean/engine-toolkit";
import {
  Camera,
  Color,
  DirectLight,
  Logger,
  Material,
  MeshRenderer,
  PrimitiveMesh,
  Shader,
  ShaderProperty,
  Vector3,
  Vector4,
  WebGLEngine
} from "@galacean/engine";

Logger.enable();

// Custom shader: uses renderer_CustomColor (per-instance) for fragment output
Shader.create(
  "CustomInstanceShader",
  `
  #include <transform_declare>
  attribute vec3 POSITION;
  attribute vec3 NORMAL;

  varying vec3 v_normal;

  void main() {
    gl_Position = renderer_MVPMat * vec4(POSITION, 1.0);
    v_normal = normalize((renderer_NormalMat * vec4(NORMAL, 0.0)).xyz);
  }
  `,
  `
  uniform vec4 renderer_CustomColor;

  varying vec3 v_normal;

  void main() {
    vec3 lightDir = normalize(vec3(1.0, 1.0, 1.0));
    float NdotL = max(dot(v_normal, lightDir), 0.2);
    gl_FragColor = vec4(renderer_CustomColor.rgb * NdotL, 1.0);
  }
  `
);

WebGLEngine.create({ canvas: "canvas" }).then((engine) => {
  engine.canvas.resizeByClientSize();

  const scene = engine.sceneManager.activeScene;
  const rootEntity = scene.createRootEntity("Root");

  // Camera
  const cameraEntity = rootEntity.createChild("Camera");
  cameraEntity.transform.setPosition(0, 10, 80);
  cameraEntity.transform.lookAt(new Vector3(0, 0, 0));
  const camera = cameraEntity.addComponent(Camera);
  camera.farClipPlane = 300;
  cameraEntity.addComponent(OrbitControl);

  // Light
  const lightEntity = rootEntity.createChild("Light");
  lightEntity.transform.setRotation(-45, -45, 0);
  lightEntity.addComponent(DirectLight).color = new Color(1, 1, 1, 1);

  // Shared mesh and material
  const mesh = PrimitiveMesh.createCuboid(engine, 1, 1, 1);
  const material = new Material(engine, Shader.find("CustomInstanceShader"));
  const customColorProperty = ShaderProperty.getByName("renderer_CustomColor");

  // Create 1000 cubes, each with a unique color via renderer shaderData
  const count = 1000;
  const spread = 50;
  for (let i = 0; i < count; i++) {
    const entity = rootEntity.createChild("Cube" + i);
    entity.transform.setPosition(
      (Math.random() - 0.5) * spread,
      (Math.random() - 0.5) * spread,
      (Math.random() - 0.5) * spread
    );
    entity.transform.setRotation(Math.random() * 360, Math.random() * 360, Math.random() * 360);

    const renderer = entity.addComponent(MeshRenderer);
    renderer.mesh = mesh;
    renderer.setMaterial(material);

    // Set per-instance custom color on renderer's shaderData (not material's)
    renderer.shaderData.setVector4(customColorProperty, new Vector4(Math.random(), Math.random(), Math.random(), 1.0));
  }

  engine.run();
});
