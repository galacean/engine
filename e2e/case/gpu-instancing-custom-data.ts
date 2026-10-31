/**
 * @title GPU Instancing Custom Data
 * @category Mesh
 */
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
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { initScreenshot, updateForE2E } from "./.mockForE2E";

Logger.enable();

const shaderCompiler = new ShaderCompiler();

// Custom shader: uses renderer_CustomColor (per-instance) for fragment output
const customInstanceShaderSource = `Shader "CustomInstanceShader" {
  SubShader "Default" {
    Pass "Forward" {
      struct Attributes {
        vec3 POSITION;
        vec3 NORMAL;
      };

      struct Varyings {
        vec3 v_normal;
      };

      mat4 renderer_MVPMat;
      mat4 renderer_NormalMat;
      vec4 renderer_CustomColor;

      VertexShader = vert;
      FragmentShader = frag;

      Varyings vert(Attributes attr) {
        Varyings v;
        gl_Position = renderer_MVPMat * vec4(attr.POSITION, 1.0);
        v.v_normal = normalize((renderer_NormalMat * vec4(attr.NORMAL, 0.0)).xyz);
        return v;
      }

      vec4 frag(Varyings v) {
        vec3 lightDir = normalize(vec3(1.0, 1.0, 1.0));
        float NdotL = max(dot(v.v_normal, lightDir), 0.2);
        return vec4(renderer_CustomColor.rgb * NdotL, 1.0);
      }
    }
  }
}`;

WebGLEngine.create({ canvas: "canvas", shaderCompiler }).then((engine) => {
  Shader.create(customInstanceShaderSource);
  engine.canvas.setAutoResolution(2);

  const scene = engine.sceneManager.activeScene;
  const rootEntity = scene.createRootEntity("Root");

  // Camera
  const cameraEntity = rootEntity.createChild("Camera");
  cameraEntity.transform.setPosition(0, 10, 80);
  cameraEntity.transform.lookAt(new Vector3(0, 0, 0));
  const camera = cameraEntity.addComponent(Camera);
  camera.farClipPlane = 300;

  // Light
  const lightEntity = rootEntity.createChild("Light");
  lightEntity.transform.setRotation(-45, -45, 0);
  lightEntity.addComponent(DirectLight).color = new Color(1, 1, 1, 1);

  // Shared mesh and material
  const mesh = PrimitiveMesh.createCuboid(engine, 1, 1, 1);
  const material = new Material(engine, Shader.find("CustomInstanceShader"));
  const customColorProperty = ShaderProperty.getByName("renderer_CustomColor");

  // Create cubes with deterministic positions and colors
  const count = 500;
  const spread = 50;
  for (let i = 0; i < count; i++) {
    const entity = rootEntity.createChild("Cube" + i);
    const t = i / count;
    entity.transform.setPosition(
      Math.sin(t * 137.5) * spread * 0.5,
      Math.cos(t * 97.3) * spread * 0.5,
      Math.sin(t * 59.1) * spread * 0.5
    );
    entity.transform.setRotation(t * 360, t * 720, t * 1080);

    const renderer = entity.addComponent(MeshRenderer);
    renderer.mesh = mesh;
    renderer.setMaterial(material);

    // Deterministic colors based on index
    renderer.shaderData.setVector4(
      customColorProperty,
      new Vector4(Math.sin(t * 6.28) * 0.5 + 0.5, Math.cos(t * 4.71) * 0.5 + 0.5, Math.sin(t * 3.14) * 0.5 + 0.5, 1.0)
    );
  }

  updateForE2E(engine);
  initScreenshot(engine, camera);
});
